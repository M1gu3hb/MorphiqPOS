import { obtenerDb, repoCaja } from '@morphiqpos/data';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { cerrarCaja } from '../caja/sesion.ts';
import { comando } from '../produccion.ts';
import {
  abrirCajaReal,
  ambitoDe,
  clave,
  exigirOk,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { abrirMesa } from './mesas.ts';
import {
  PRECIO_ARRACHERA,
  PRECIO_CERVEZA,
  abrirLasCajas,
  ambitoDeCaja,
  cobrarExacto,
  dividirEn,
  mesaPersistida,
  pedirLaCuenta,
  sembrarSalon,
  sentarYPedir,
  type Salon,
} from './pruebas/salon-real.ts';

/**
 * C10 · LA ÚLTIMA CAJA NO CIERRA CON CUENTAS VIVAS (DP-10.2, contra Postgres).
 *
 * Antes `caja.cerrar` dejaba cerrar con una mesa abierta: su cuenta no tiene `sesion_caja_id`
 * hasta que se cobra, así que para el cierre era invisible. El corte salía cuadrado sin una venta
 * que ya se comió, la mesa se quedaba sentada toda la noche sin caja que la cobrara, y una cuenta
 * dividida a medias quedaba repartida entre dos cortes. La única defensa era la pantalla de
 * Cierre diario, con una lectura del salón seguida de una escritura que no la repetía.
 *
 * Ahora lo decide el servidor, dentro de la transacción del cierre:
 *   · si es la ÚLTIMA caja abierta de la sucursal y quedan cuentas vivas (mesas abiertas o partes
 *     de una cuenta dividida sin cobrar), lo rechaza y dice cuáles mesas faltan;
 *   · si hay otra caja abierta, cierra y AVISA: las cobrará la otra.
 * Las cajas de la sucursal se bloquean en orden antes de decidir: dos que cierran a la vez no
 * pueden creer las dos que «queda la otra».
 */

const FONDO = 50_000;
const REGLA = { codigo: 'REGLA_DE_NEGOCIO', datos: { regla: 'TRANSICION_INVALIDA' } } as const;

/** El rechazo de la última caja: la regla, y las mesas que faltan dichas con palabras. */
function rechazoPor(mesas: string) {
  return {
    ok: false,
    error: {
      ...REGLA,
      mensaje: `Quedan cuentas sin cobrar en ${mesas}: cóbralas antes de cerrar la última caja abierta.`,
    },
  };
}

/** Un restaurante nuevo con sus cajas ya abiertas. */
async function salonConCajas(nombre: string, terminales = 1) {
  const salon = await sembrarSalon({ nombre, mesas: 3, terminales });
  const cajas = await abrirLasCajas(salon, FONDO);
  return { salon, cajas };
}

function cerrar(salon: Salon, efectivoContadoCentavos: number, terminal = 0) {
  return comando(cerrarCaja, {
    entrada: { efectivoContadoCentavos },
    ambito: ambitoDeCaja(salon, terminal),
    idempotencyKey: clave(),
  });
}

function estadoDe(sesionCajaId: string) {
  return obtenerDb()
    .selectFrom('sesiones_caja')
    .select('estado')
    .where('id', '=', sesionCajaId)
    .executeTakeFirstOrThrow();
}

describe('C10 · la última caja no cierra con cuentas vivas', () => {
  it('rechaza el cierre y dice qué mesas faltan; cobradas, cierra', async () => {
    const { salon, cajas } = await salonConCajas('Restaurante del cierre con mesas');
    // La mesa 1 ya pidió la cuenta; la mesa 2 está comiendo y su comanda sigue en la plancha.
    const pidioLaCuenta = await sentarYPedir(salon, 0, [{ platillo: 'arrachera', cantidad: '1' }]);
    await pedirLaCuenta(salon, pidioLaCuenta.ordenId);
    const comiendo = await sentarYPedir(salon, 1, [{ platillo: 'cerveza', cantidad: '2' }]);

    expect(await cerrar(salon, FONDO)).toMatchObject(rechazoPor('las mesas 1 y 2'));
    expect(await estadoDe(cajas[0] ?? '')).toEqual({ estado: 'abierta' });

    await pedirLaCuenta(salon, comiendo.ordenId);
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon), pidioLaCuenta.ordenId, Number(PRECIO_ARRACHERA)),
      'venta.cobrar (mesa 1)',
    );
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon), comiendo.ordenId, 2 * Number(PRECIO_CERVEZA)),
      'venta.cobrar (mesa 2)',
    );
    const corte = exigirOk(
      await cerrar(salon, FONDO + Number(PRECIO_ARRACHERA) + 2 * Number(PRECIO_CERVEZA)),
      'caja.cerrar con el salón cobrado',
    );
    expect(corte).toMatchObject({ diferenciaCentavos: '0', numeroVentas: 2 });
    expect(corte).not.toHaveProperty('aviso');
  });

  it('la parte sin cobrar de una cuenta dividida también detiene la última caja', async () => {
    const { salon } = await salonConCajas('Restaurante de la cuenta partida');
    const mesa = await sentarYPedir(salon, 0, [
      { platillo: 'arrachera', cantidad: '1' },
      { platillo: 'cerveza', cantidad: '1' },
    ]);
    await pedirLaCuenta(salon, mesa.ordenId);
    const division = await dividirEn(salon, mesa.ordenId, [
      [{ platillo: 'arrachera', cantidad: 1 }],
      [{ platillo: 'cerveza', cantidad: 1 }],
    ]);
    const [parteA] = division.hijas;
    if (parteA === undefined) throw new Error('Debían salir dos partes.');
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon), parteA.ordenId, Number(PRECIO_ARRACHERA)),
      'venta.cobrar (la parte que sí paga)',
    );

    expect(await cerrar(salon, FONDO + Number(PRECIO_ARRACHERA))).toMatchObject(
      rechazoPor('la mesa 1'),
    );
    expect(await mesaPersistida(mesa.mesaId)).toMatchObject({ estado: 'cuenta_solicitada' });
  });

  it('con otra caja abierta cierra y avisa; la que queda ya es la última', async () => {
    const { salon, cajas } = await salonConCajas('Restaurante de dos cajas', 2);
    const mesa = await sentarYPedir(salon, 2, [{ platillo: 'arrachera', cantidad: '1' }]);

    const primera = exigirOk(await cerrar(salon, FONDO, 0), 'caja.cerrar con otra caja abierta');
    expect(primera).toMatchObject({
      aviso: { mesas: [3], cuentasVivas: 1, otrasCajasAbiertas: 1 },
    });
    expect(await estadoDe(cajas[0] ?? '')).toEqual({ estado: 'cerrada' });

    expect(await cerrar(salon, FONDO, 1)).toMatchObject(rechazoPor('la mesa 3'));
    await pedirLaCuenta(salon, mesa.ordenId);
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon, 1), mesa.ordenId, Number(PRECIO_ARRACHERA)),
      'venta.cobrar en la caja que queda',
    );
    exigirOk(await cerrar(salon, FONDO + Number(PRECIO_ARRACHERA), 1), 'caja.cerrar la última');
  });

  it('el cierre bloquea las otras cajas de la sucursal antes de decidir', async () => {
    const { salon, cajas } = await salonConCajas('Restaurante del cierre a la vez', 2);
    await sentarYPedir(salon, 0, [{ platillo: 'cerveza', cantidad: '1' }]);
    const otra = cajas[1] ?? '';

    // Una transacción aparte tiene la fila de la OTRA caja. El cierre de la primera tiene que
    // esperarla: si no la bloqueara, leería «queda la otra» mientras la otra también se cierra.
    let espero = false;
    let resultado: Awaited<ReturnType<typeof cerrar>> | undefined;
    await obtenerDb()
      .transaction()
      .execute(async (tx) => {
        await sql`select id from sesiones_caja where id = ${otra} for update`.execute(tx);
        const cierre = cerrar(salon, FONDO, 0).then((r) => {
          resultado = r;
        });
        for (let intento = 0; intento < 100 && resultado === undefined; intento += 1) {
          const { rows } = await sql<{ esperando: boolean }>`
            select exists (
              select 1 from pg_stat_activity
              where wait_event_type = 'Lock' and query ilike '%sesiones_caja%'
                and pid <> pg_backend_pid()
            ) as esperando
          `.execute(obtenerDb());
          if (rows[0]?.esperando === true) {
            espero = true;
            break;
          }
          await new Promise((listo) => setTimeout(listo, 50));
        }
        expect(espero, 'El cierre no esperó a la otra caja: decidió sin bloquearla.').toBe(true);
        void cierre;
      });
    await expect.poll(() => resultado?.ok).toBe(true);
    expect(resultado).toMatchObject({ datos: { aviso: { otrasCajasAbiertas: 1 } } });
  });

  it('dos cajas que cierran a la vez con una mesa viva: sólo una cierra', async () => {
    const { salon, cajas } = await salonConCajas('Restaurante de los dos cierres', 2);
    await sentarYPedir(salon, 1, [{ platillo: 'guacamole', cantidad: '1' }]);
    const [a, b] = await Promise.all([cerrar(salon, FONDO, 0), cerrar(salon, FONDO, 1)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const estados = await Promise.all(cajas.map((c) => estadoDe(c)));
    expect(estados.map((e) => e.estado).sort()).toEqual(['abierta', 'cerrada']);
    const sigue = await repoCaja.sesionAbiertaDeTerminal(
      obtenerDb(),
      salon.negocio.organizacionId,
      salon.sucursal.terminales[a.ok ? 1 : 0] ?? '',
      false,
    );
    expect(sigue).not.toBeNull();
  });

  it('una caja nueva se puede abrir y cobrar lo que quedó, como siempre', async () => {
    const { salon, cajas } = await salonConCajas('Restaurante de la mañana siguiente', 2);
    const mesa = await sentarYPedir(salon, 0, [{ platillo: 'arrachera', cantidad: '1' }]);
    exigirOk(await cerrar(salon, FONDO, 0), 'caja.cerrar con otra abierta');
    await pedirLaCuenta(salon, mesa.ordenId);
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon, 1), mesa.ordenId, Number(PRECIO_ARRACHERA)),
      'venta.cobrar',
    );
    exigirOk(await cerrar(salon, FONDO + Number(PRECIO_ARRACHERA), 1), 'caja.cerrar');
    const nueva = await abrirCajaReal(ambitoDeCaja(salon, 0), FONDO);
    expect(cajas).not.toContain(nueva);
  });

  it('otra SUCURSAL no cuenta: ni su caja abierta es «la otra», ni su mesa detiene ésta', async () => {
    const { salon } = await salonConCajas('Restaurante de dos sucursales');
    const otra = await sembrarSucursal(salon.negocio, { terminales: ['Caja de la otra'] });
    const ambitoDeLaOtra = ambitoDe(salon.negocio, otra.sucursalId, otra.terminales[0] ?? null);
    await abrirCajaReal(ambitoDeLaOtra, FONDO);
    const mesaDeLaOtra = (
      await obtenerDb()
        .insertInto('mesas')
        .values({
          organizacion_id: salon.negocio.organizacionId,
          sucursal_id: otra.sucursalId,
          numero: 9,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    exigirOk(
      await comando(abrirMesa, {
        entrada: { mesaId: mesaDeLaOtra, personas: 2 },
        ambito: ambitoDeLaOtra,
        idempotencyKey: clave(),
      }),
      'restaurante.abrir_mesa en la otra sucursal',
    );

    // Con una mesa viva aquí, la caja abierta de la otra sucursal no la salva.
    const aqui = await sentarYPedir(salon, 0, [{ platillo: 'cerveza', cantidad: '1' }]);
    expect(await cerrar(salon, FONDO)).toMatchObject(rechazoPor('la mesa 1'));

    // Cobrada la de aquí, la mesa 9 de la otra sucursal no detiene este cierre ni se avisa.
    await pedirLaCuenta(salon, aqui.ordenId);
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon), aqui.ordenId, Number(PRECIO_CERVEZA)),
      'venta.cobrar',
    );
    const corte = exigirOk(
      await cerrar(salon, FONDO + Number(PRECIO_CERVEZA)),
      'caja.cerrar con una mesa viva en OTRA sucursal',
    );
    expect(corte).not.toHaveProperty('aviso');
  });
});
