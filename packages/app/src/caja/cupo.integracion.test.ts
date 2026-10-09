import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

import { sesionAbierta } from '../compras/sesion-de-caja.ts';
import { enCarrera } from '../pruebas/carrera.ts';
import {
  abrirCajaReal,
  ambitoDe,
  clave,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { abrirCaja } from './sesion.ts';

/**
 * F-235 · EL CUPO DE CAJAS DE LA SUCURSAL, contra Postgres (179, bloque D.9 de la 2.4).
 *
 * `cupo.test.ts` prueba la regla sobre la base falsa y declara lo que ella no alcanza, que
 * es lo que vive aquí:
 *
 *   · el NOMBRE de la terminal que tiene la caja, que sale de un `leftJoin` y es lo único
 *     que le dice a la cajera dónde ir a hacer el corte;
 *   · el DISPARADOR de la 179, que es quien de verdad hace cumplir el cupo —la
 *     comprobación del comando sólo pone las palabras—, rechazando con el código y el
 *     nombre del índice de la 046 que sustituyó;
 *   · la CARRERA: dos terminales abriendo a la vez, las dos pasan la comprobación del
 *     comando y sólo una puede pasar la de la base. Es para lo que el disparador bloquea
 *     la fila de la sucursal antes de contar;
 *   · y el gasto en efectivo que sale del cajón de SU terminal cuando hay dos abiertas,
 *     con el día calculado en SQL en la zona del negocio.
 *
 * Cada prueba siembra su propia sucursal: el cupo es de la sucursal, y compartirla haría
 * que una caja abierta por una prueba contara en la siguiente.
 */

let negocio: NegocioReal;

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Abarrotes del Cupo', rol: 'cajero' });
});

function abrirDesde(sucursalId: string, terminalId: string) {
  return comando(abrirCaja, {
    entrada: { fondoInicialCentavos: 50_000 },
    ambito: ambitoDe(negocio, sucursalId, terminalId),
    idempotencyKey: clave(),
  });
}

async function abiertasEn(sucursalId: string): Promise<{ terminal_id: string }[]> {
  return obtenerDb()
    .selectFrom('sesiones_caja')
    .select('terminal_id')
    .where('organizacion_id', '=', negocio.organizacionId)
    .where('sucursal_id', '=', sucursalId)
    .where('estado', '=', 'abierta')
    .execute();
}

describe('F-235 · cuántas cajas abre una sucursal, contra Postgres', () => {
  it('con el cupo en uno, la segunda terminal no abre y el mensaje nombra la que tiene la caja', async () => {
    const { sucursalId, terminales } = await sembrarSucursal(negocio, {
      terminales: ['Caja 1', 'Barra 2'],
    });
    const [caja1, barra2] = terminales as [string, string];

    expect((await abrirDesde(sucursalId, caja1)).ok).toBe(true);
    const segunda = await abrirDesde(sucursalId, barra2);

    expect(segunda.ok).toBe(false);
    if (segunda.ok) return;
    // El rechazo del COMANDO, con palabras: no el 23505 del disparador traducido a
    // «Algo falló de nuestro lado». Y con el nombre de la terminal, que sale del `join`.
    expect(segunda.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(segunda.error.datos?.['regla']).toBe('CAJA_YA_ABIERTA');
    expect(segunda.error.mensaje).toContain('«Caja 1»');
    expect(await abiertasEn(sucursalId)).toEqual([{ terminal_id: caja1 }]);
  });

  it('el disparador de la 179 rechaza la segunda caja por su cuenta: 23505 con el nombre del índice de la 046', async () => {
    const { sucursalId, terminales } = await sembrarSucursal(negocio, {
      terminales: ['Caja 1', 'Barra 2'],
    });
    const [caja1, barra2] = terminales as [string, string];
    await abrirCajaReal(ambitoDe(negocio, sucursalId, caja1));

    // Directo a la tabla, sin pasar por el comando: es lo que haría un camino que se
    // olvidó de comprobar el cupo, o una apertura que se coló entre la lectura del
    // comando y su `insert`. La base tiene que decir que no sola.
    await expect(
      conTransaccion((tx) =>
        tx
          .insertInto('sesiones_caja')
          .values({
            organizacion_id: negocio.organizacionId,
            sucursal_id: sucursalId,
            terminal_id: barra2,
            empleado_abre_id: negocio.empleoId,
            estado: 'abierta',
          })
          .execute(),
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'sesiones_caja_una_abierta_por_sucursal',
    });
    expect(await abiertasEn(sucursalId)).toHaveLength(1);
  });

  it('con el cupo en dos, dos terminales abren y la tercera no, ni por el comando ni por la base', async () => {
    const { sucursalId, terminales } = await sembrarSucursal(negocio, {
      terminales: ['Barra 1', 'Barra 2', 'Barra 3'],
      cajasSimultaneas: 2,
    });
    const [barra1, barra2, barra3] = terminales as [string, string, string];

    expect((await abrirDesde(sucursalId, barra1)).ok).toBe(true);
    expect((await abrirDesde(sucursalId, barra2)).ok).toBe(true);
    const tercera = await abrirDesde(sucursalId, barra3);

    expect(tercera.ok).toBe(false);
    if (tercera.ok) return;
    expect(tercera.error.datos?.['regla']).toBe('CAJA_YA_ABIERTA');
    expect(tercera.error.mensaje).toContain('sus 2 cajas abiertas');

    await expect(
      conTransaccion((tx) =>
        tx
          .insertInto('sesiones_caja')
          .values({
            organizacion_id: negocio.organizacionId,
            sucursal_id: sucursalId,
            terminal_id: barra3,
            empleado_abre_id: negocio.empleoId,
            estado: 'abierta',
          })
          .execute(),
      ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await abiertasEn(sucursalId)).toHaveLength(2);
  });

  it('con dos cajas abiertas, el gasto en efectivo sale del cajón de SU terminal y lleva el día del negocio', async () => {
    const { sucursalId, terminales } = await sembrarSucursal(negocio, {
      terminales: ['Barra 1', 'Barra 2'],
      cajasSimultaneas: 2,
    });
    const [barra1, barra2] = terminales as [string, string];
    await abrirCajaReal(ambitoDe(negocio, sucursalId, barra1));
    const deBarra2 = await abrirCajaReal(ambitoDe(negocio, sucursalId, barra2));

    const desdeBarra2 = await conTransaccion((tx) =>
      sesionAbierta(tx, negocio.organizacionId, sucursalId, barra2),
    );
    expect(desdeBarra2.id).toBe(deBarra2);

    // El día es el de la apertura EN LA ZONA DEL NEGOCIO, no el del servidor: un turno
    // que cruza la medianoche UTC sigue siendo del día en que se abrió la caja.
    const { abierta_en: abiertaEn } = await obtenerDb()
      .selectFrom('sesiones_caja')
      .select('abierta_en')
      .where('id', '=', deBarra2)
      .executeTakeFirstOrThrow();
    const diaDelNegocio = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
    }).format(abiertaEn);
    expect(desdeBarra2.fecha).toBe(diaDelNegocio);

    // Desde la oficina —sin caja propia— y con dos abiertas no se adivina de cuál salió.
    await expect(
      conTransaccion((tx) => sesionAbierta(tx, negocio.organizacionId, sucursalId, null)),
    ).rejects.toMatchObject({ codigo: 'CAJA_CERRADA' });
  });

  it('CASH-02: dos terminales abren A LA VEZ con el cupo en uno y sólo una caja queda abierta', async () => {
    const { sucursalId, terminales } = await sembrarSucursal(negocio, {
      terminales: ['Caja A', 'Caja B'],
    });
    const [cajaA, cajaB] = terminales as [string, string];

    // La barrera: la tabla en modo SHARE. Las dos aperturas leen el cupo —las dos ven
    // cero cajas— y se forman en su `insert`, que pide ROW EXCLUSIVE. Al soltarlas, el
    // único que puede separarlas es el `for update` del disparador sobre la sucursal.
    const [a, b] = await enCarrera(
      (tx) => sql`lock table sesiones_caja in share mode`.execute(tx),
      [() => abrirDesde(sucursalId, cajaA), () => abrirDesde(sucursalId, cajaB)],
    );

    expect([a, b].filter((r) => r?.ok)).toHaveLength(1);
    // Y la que perdió lo oye con palabras: el 23505 del disparador traducido, no
    // «Algo falló de nuestro lado» (`traducirAperturaQuePerdio`).
    const perdedora = [a, b].find((r) => r !== undefined && !r.ok);
    expect(perdedora?.ok).toBe(false);
    if (perdedora === undefined || perdedora.ok) return;
    expect(perdedora.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(perdedora.error.datos?.['regla']).toBe('CAJA_YA_ABIERTA');
    expect(await abiertasEn(sucursalId)).toHaveLength(1);
    // La perdedora no abrió nada: ni sesión ni fondo en el cajón.
    const movimientos = await obtenerDb()
      .selectFrom('movimientos_caja')
      .innerJoin('sesiones_caja', 'sesiones_caja.id', 'movimientos_caja.sesion_caja_id')
      .select('movimientos_caja.id')
      .where('sesiones_caja.sucursal_id', '=', sucursalId)
      .where('movimientos_caja.tipo', '=', 'apertura')
      .execute();
    expect(movimientos).toHaveLength(1);
  });
});
