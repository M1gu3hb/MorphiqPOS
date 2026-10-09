import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { enCarrera } from '../pruebas/carrera.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { agendarCita } from './agenda.ts';

/**
 * F-400 · LA MISMA PERSONA A LA MISMA HORA, contra Postgres (132, bloque D.9 de la 2.4).
 *
 * `agenda.ts` lo dice: el choque se comprueba en el comando —para poder decir «esa persona
 * ya tiene a alguien a esa hora» con palabras— Y en la base, con la exclusión GiST de la
 * 132, «porque dos peticiones simultáneas pasan las dos por aquí y sólo una puede pasar por
 * Postgres». Ninguna de las dos sobra, y cada una tiene aquí la prueba que la ve fallar:
 *
 *   · la secuencial, que la de palabras rechace el choque y deje pasar la cita que
 *     empieza justo cuando la otra termina (los rangos son `[inicio, fin)`);
 *   · la simultánea, que de dos reservas a la vez para la misma persona y horas que se
 *     pisan sólo quede una. La recepcionista y la clienta desde el portal, en el mismo
 *     segundo.
 *
 * La barrera de la carrera es la fila del folio de citas: las dos reservas ya miraron la
 * agenda —vacía— cuando se forman en `tomar_folio`, y al soltarse la única que puede
 * separarlas es la exclusión.
 */

const CORTE_MIN = 45;

let negocio: NegocioReal;
let sucursalId: string;
let servicioId: string;

/** Una persona que da el corte, con su asignación al servicio. */
async function sembrarProfesional(nombreCorto: string): Promise<string> {
  const id = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('profesionales')
      .values({
        id,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursalId,
        empleo_id: negocio.empleoId,
        nombre_completo: `${nombreCorto} de Prueba`,
        nombre_corto: nombreCorto,
        tipo_relacion: 'empleado',
        color_agenda: '#aa33cc',
      })
      .execute();
    await tx
      .insertInto('servicios_profesional')
      .values({
        organizacion_id: negocio.organizacionId,
        servicio_id: servicioId,
        profesional_id: id,
        precio_centavos: 30_000n,
      })
      .execute();
  });
  return id;
}

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Salón de la Agenda',
    rol: 'cajero',
    giro: 'estetica',
    paquete: 'estetica',
  });
  ({ sucursalId } = await sembrarSucursal(negocio, { terminales: ['Recepción'] }));
  servicioId = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('productos')
      .values({
        id: servicioId,
        organizacion_id: negocio.organizacionId,
        nombre: 'Corte de dama',
        precio_venta_centavos: 25_000n,
        tipo_venta: 'servicio',
        estrategia_consumo: 'ninguno',
      })
      .execute();
    await tx
      .insertInto('servicios')
      .values({
        producto_id: servicioId,
        organizacion_id: negocio.organizacionId,
        duracion_activa_1_min: CORTE_MIN,
      })
      .execute();
  });
});

function agendar(profesionalId: string, inicio: string) {
  return comando(agendarCita, {
    entrada: { inicio, servicios: [{ servicioId, profesionalId }] },
    ambito: ambitoDe(negocio, sucursalId, null),
    idempotencyKey: clave(),
  });
}

async function serviciosVivosDe(profesionalId: string): Promise<{ rango_ocupacion: string }[]> {
  return obtenerDb()
    .selectFrom('cita_servicios')
    .select('rango_ocupacion')
    .where('profesional_id', '=', profesionalId)
    .where('estado', '<>', 'cancelado')
    .execute();
}

describe('F-400 · nadie queda agendado dos veces a la misma hora', () => {
  it('la segunda reserva que se pisa se rechaza con palabras, y la que empieza al terminar la primera entra', async () => {
    const karla = await sembrarProfesional('Karla');
    exigirOk(await agendar(karla, '2026-11-20T16:00:00.000Z'), 'agenda.agendar_cita');

    const encima = await agendar(karla, '2026-11-20T16:30:00.000Z');
    expect(encima.ok).toBe(false);
    if (encima.ok) return;
    // El rechazo de la comprobación del COMANDO, que vio la cita de las 16:00. No el de la
    // exclusión traducida: ése habla de «otra reserva que entró mientras agendabas», y
    // aquí no hubo carrera ninguna.
    expect(encima.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(encima.error.datos?.['regla']).toBe('CONFIGURACION_CONFLICTO');
    expect(encima.error.mensaje).toBe('Esa persona ya tiene a alguien a esa hora.');

    // 16:00 + 45 min = 16:45, y `[16:00, 16:45)` no toca a `[16:45, 17:30)`.
    exigirOk(await agendar(karla, '2026-11-20T16:45:00.000Z'), 'agenda.agendar_cita');
    expect(await serviciosVivosDe(karla)).toHaveLength(2);
  });

  it('dos reservas A LA VEZ para la misma persona con horas que se pisan: sólo una queda', async () => {
    const dany = await sembrarProfesional('Dany');

    const [a, b] = await enCarrera(
      async (tx) => {
        // La fila del folio de citas de la sucursal, creada si es la primera y bloqueada.
        await tx
          .insertInto('folios')
          .values({
            organizacion_id: negocio.organizacionId,
            sucursal_id: sucursalId,
            serie: 'CITA',
            siguiente: 1n,
          })
          .onConflict((oc) => oc.columns(['organizacion_id', 'sucursal_id', 'serie']).doNothing())
          .execute();
        return tx
          .selectFrom('folios')
          .select('siguiente')
          .where('organizacion_id', '=', negocio.organizacionId)
          .where('sucursal_id', '=', sucursalId)
          .where('serie', '=', 'CITA')
          .forUpdate()
          .executeTakeFirstOrThrow();
      },
      [
        () => agendar(dany, '2026-11-20T18:00:00.000Z'),
        () => agendar(dany, '2026-11-20T18:20:00.000Z'),
      ],
    );

    expect([a, b].filter((r) => r?.ok)).toHaveLength(1);
    const perdedoras = [a, b].filter((r) => r !== undefined && !r.ok);
    expect(perdedoras).toHaveLength(1);
    // La que perdió en la exclusión oye lo mismo que la que pierde en la comprobación de
    // palabras: no «Algo falló de nuestro lado» (`traducirReservaQuePerdio`).
    const perdedora = perdedoras[0];
    if (perdedora === undefined || perdedora.ok) return;
    expect(perdedora.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(perdedora.error.datos?.['regla']).toBe('CONFIGURACION_CONFLICTO');
    expect(await serviciosVivosDe(dany)).toHaveLength(1);

    // La perdedora no dejó una cita huérfana sin servicio: su `insert` se revirtió entero.
    const citasHuerfanas = await obtenerDb()
      .selectFrom('citas')
      .leftJoin('cita_servicios', 'cita_servicios.cita_id', 'citas.id')
      .select('citas.id')
      .where('citas.organizacion_id', '=', negocio.organizacionId)
      .where('cita_servicios.id', 'is', null)
      .execute();
    expect(citasHuerfanas).toEqual([]);
  });
});
