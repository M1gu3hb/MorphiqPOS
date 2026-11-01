import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { exigirOk } from '../pruebas/negocio-real.ts';
import { TELEFONO_A, lineasDeLaCuenta, mesaConPortal } from './pruebas/mesa-con-portal.ts';

/**
 * DP-9.5 · EL ENVÍO DEL CARRITO CONTRA LA CAJA, contra Postgres real.
 *
 * Dos «Enviar» a la vez los ordena la fila de `carritos_mesa`. Lo que ordena el candado de la
 * CUENTA es otra carrera: el teléfono manda el pedido mientras la caja cierra esa cuenta. Sin el
 * candado, el pedido leía la cuenta abierta, esperaba a la caja y dejaba sus renglones en una
 * cuenta ya cerrada. Con él, espera, vuelve a leer y se le dice.
 *
 * Determinista: la prueba toma el candado de la cuenta como lo toma el cobro y no la cierra hasta
 * ver al envío ESPERANDO un candado en `pg_stat_activity`.
 */

async function hayAlguienEsperandoUnCandado(): Promise<boolean> {
  const { rows } = await sql<{ n: string }>`
    select count(*)::text as n
      from pg_stat_activity
     where datname = current_database()
       and wait_event_type = 'Lock'
  `.execute(obtenerDb());
  return Number(rows[0]?.n ?? 0) > 0;
}

async function esperarA(condicion: () => Promise<boolean>, mensaje: string): Promise<void> {
  for (let intento = 0; intento < 100; intento += 1) {
    if (await condicion()) return;
    await new Promise((listo) => setTimeout(listo, 50));
  }
  throw new Error(mensaje);
}

describe('el envío del carrito contra la caja', () => {
  it('si la caja cierra la cuenta mientras el teléfono envía, nada queda en la cuenta cerrada', async () => {
    const caso = await mesaConPortal();
    const { ventaId: ordenId } = await caso.abrir(1);
    exigirOk(await caso.agregar(TELEFONO_A, caso.taco), 'agregar');

    let envio: ReturnType<typeof caso.enviar> | undefined;
    await conTransaccion(async (caja) => {
      await caja.selectFrom('ordenes').select('id').where('id', '=', ordenId).forUpdate().execute();
      envio = caso.enviar(TELEFONO_A, true);
      await esperarA(hayAlguienEsperandoUnCandado, 'El envío no llegó a esperar a la caja.');
      const ahora = new Date();
      await caja
        .updateTable('ordenes')
        .set({
          estado: 'cancelada',
          motivo_cancelacion: 'la caja la cerró mientras el teléfono enviaba',
          cancelada_en: ahora,
          cerrada_en: ahora,
        })
        .where('id', '=', ordenId)
        .execute();
    });

    if (envio === undefined) throw new Error('No hubo envío.');
    const salida = await envio;
    expect(salida.ok, 'El pedido entró a una cuenta que la caja ya había cerrado.').toBe(false);
    expect(await lineasDeLaCuenta(caso.mesaId)).toHaveLength(0);
  });
});
