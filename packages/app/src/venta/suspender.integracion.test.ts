import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ambitoDe,
  armarVenta,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { cancelarApartada, suspenderVenta } from './suspender.ts';

/**
 * F-224 · CANCELAR UNA VENTA APARTADA, contra Postgres (bloque D de la 2.4).
 *
 * El cliente que dijo «ahorita vengo» y no volvió: la venta apartada se cancela con su
 * motivo. Contra la base real eso fallaba siempre: el comando escribía `estado =
 * 'cancelada'` sin `cerrada_en`, y `orden_cerrada_con_fecha` (045) exige que una orden
 * pagada o cancelada tenga fecha de cierre. 23514, «Algo falló de nuestro lado», y la caja
 * no se podía cerrar porque la apartada seguía viva. La base falsa no mira `check`; ésta sí.
 */

let ambito: ReturnType<typeof ambitoDe>;
let productoId: string;

beforeAll(async () => {
  const negocio = await sembrarNegocio({ nombre: 'Abarrotes del Apartado', rol: 'cajero' });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja 1'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  ({ productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Pan de caja',
    precioCentavos: 4_500n,
    existencia: '5',
  }));
});

describe('F-224 · la venta apartada que se cancela', () => {
  it('queda cancelada y CERRADA, con quién, cuándo y por qué, y sin código de espera vivo', async () => {
    const { ordenId } = await armarVenta(ambito, [{ productoId, cantidad: '1' }]);
    const { codigo } = exigirOk(
      await comando(suspenderVenta, {
        entrada: { ordenId, nota: 'El señor de la gorra' },
        ambito,
        idempotencyKey: clave(),
      }),
      'venta.suspender',
    );

    const cancelada = exigirOk(
      await comando(cancelarApartada, {
        entrada: { codigo, motivo: 'No regresó el cliente' },
        ambito,
        idempotencyKey: clave(),
      }),
      'venta.cancelar_apartada',
    );
    expect(cancelada).toEqual({ ordenId, codigo });

    const orden = await obtenerDb()
      .selectFrom('ordenes')
      .select([
        'estado',
        'codigo_espera',
        'motivo_cancelacion',
        'cancelada_por',
        'cancelada_en',
        'cerrada_en',
      ])
      .where('id', '=', ordenId)
      .executeTakeFirstOrThrow();
    expect(orden).toMatchObject({
      estado: 'cancelada',
      codigo_espera: null,
      motivo_cancelacion: 'No regresó el cliente',
      cancelada_por: ambito.empleoId,
    });
    expect(orden.cerrada_en).toBeInstanceOf(Date);
    expect(orden.cancelada_en).toEqual(orden.cerrada_en);

    // Y no movió inventario: una apartada nunca salió del almacén.
    const movimientos = await obtenerDb()
      .selectFrom('movimientos_stock')
      .select('id')
      .where('referencia_id', '=', ordenId)
      .execute();
    expect(movimientos).toEqual([]);
  });
});
