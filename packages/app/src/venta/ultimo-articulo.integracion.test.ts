import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { enCarrera } from '../pruebas/carrera.ts';
import {
  abrirCajaReal,
  ambitoDe,
  armarVenta,
  cobrarEnEfectivo,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';

/**
 * INV-03 · EL ÚLTIMO ARTÍCULO, vendido en dos cajas a la vez (bloque D.9 de la 2.4).
 *
 * Una pieza en el anaquel, `permite_venta_sin_stock` en falso y dos cajas cobrándola en
 * el mismo segundo —la cafetería de fin de semana abre dos (F-235), así que no es un caso
 * de laboratorio—. Una sola venta puede salir; la otra tiene que decir «no hay» y no dejar
 * NADA: ni pago, ni folio, ni existencia en negativo.
 *
 * Quien lo impide es `repoStock.aplicarMovimientos`: el decremento lleva la guarda en el
 * `WHERE` (`cantidad >= consumo`) dentro del mismo `UPDATE`. La segunda caja se forma en
 * el bloqueo de la fila de la existencia y, al soltarse, Postgres re-evalúa ese `WHERE`
 * sobre la fila ya decrementada: cero filas, STOCK_INSUFICIENTE, y el cobro entero se
 * revierte. La tabla `existencias` no tiene un `check (cantidad >= 0)` —la venta sin stock
 * existe y la deja en negativo a propósito—, así que esa guarda es la ÚNICA.
 *
 * La barrera es la fila de la existencia, no el `WHERE`: los dos cobros ya leyeron el
 * catálogo y planearon su consumo cuando se forman. Así la prueba distingue el decremento
 * atómico de un «leer, comprobar y después restar», que pasaría con una caja y fallaría
 * con dos.
 */

let negocio: NegocioReal;
let sucursal: SucursalReal;
let insumoId: string;
const ordenes: { ordenId: string; totalCentavos: number }[] = [];

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Panadería del Último', rol: 'cajero' });
  sucursal = await sembrarSucursal(negocio, {
    terminales: ['Caja 1', 'Caja 2'],
    cajasSimultaneas: 2,
  });
  const concha = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Concha',
    precioCentavos: 1_200n,
    existencia: '1',
    permiteVentaSinStock: false,
  });
  insumoId = concha.insumoId;
  for (const terminalId of sucursal.terminales) {
    const ambito = ambitoDe(negocio, sucursal.sucursalId, terminalId);
    await abrirCajaReal(ambito);
    ordenes.push(await armarVenta(ambito, [{ productoId: concha.productoId, cantidad: '1' }]));
  }
});

describe('INV-03 · la última pieza en dos cajas a la vez', () => {
  it('una venta sale, la otra dice que no hay, y la existencia nunca baja de cero', async () => {
    const corredoras = sucursal.terminales.map((terminalId, i) => {
      const { ordenId, totalCentavos } = ordenes[i]!;
      const ambito = ambitoDe(negocio, sucursal.sucursalId, terminalId);
      return () => cobrarEnEfectivo(ambito, ordenId, totalCentavos);
    });

    const resultados = await enCarrera(
      (tx) =>
        tx
          .selectFrom('existencias')
          .select('cantidad')
          .where('almacen_id', '=', sucursal.almacenId)
          .where('insumo_id', '=', insumoId)
          .forUpdate()
          .executeTakeFirstOrThrow(),
      corredoras,
    );

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const perdedora = resultados.find((r) => !r.ok);
    expect(perdedora).toBeDefined();
    if (perdedora === undefined || perdedora.ok) return;
    expect(perdedora.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(perdedora.error.datos?.['regla']).toBe('STOCK_INSUFICIENTE');

    const db = obtenerDb();
    const existencia = await db
      .selectFrom('existencias')
      .select('cantidad')
      .where('almacen_id', '=', sucursal.almacenId)
      .where('insumo_id', '=', insumoId)
      .executeTakeFirstOrThrow();
    expect(existencia.cantidad).toBe('0.0000');

    const salidas = await db
      .selectFrom('movimientos_stock')
      .select('cantidad')
      .where('insumo_id', '=', insumoId)
      .execute();
    expect(salidas).toEqual([{ cantidad: '-1.0000' }]);

    // La que perdió no dejó nada: su orden sigue en el carrito, sin pago y sin folio.
    const estados = await db
      .selectFrom('ordenes')
      .select(['estado', 'folio'])
      .where(
        'id',
        'in',
        ordenes.map((o) => o.ordenId),
      )
      .orderBy('estado')
      .execute();
    expect(estados).toEqual([
      { estado: 'borrador', folio: null },
      { estado: 'pagada', folio: 1n },
    ]);
    const pagos = await db
      .selectFrom('pagos')
      .select('orden_id')
      .where(
        'orden_id',
        'in',
        ordenes.map((o) => o.ordenId),
      )
      .execute();
    expect(pagos).toHaveLength(1);
    const folio = await db
      .selectFrom('folios')
      .select('siguiente')
      .where('sucursal_id', '=', sucursal.sucursalId)
      .where('serie', '=', 'A')
      .executeTakeFirstOrThrow();
    expect(folio.siguiente).toBe(2n);
  });
});
