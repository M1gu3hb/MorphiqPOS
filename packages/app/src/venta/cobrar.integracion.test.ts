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
  sembrarSinInventario,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';

/**
 * EL COBRO DOBLE · LA MISMA ORDEN COBRADA DOS VECES A LA VEZ, contra Postgres (D.9 de la 2.4).
 *
 * El doble clic, el reintento con una clave NUEVA, dos pantallas con la misma cuenta: dos
 * cobros de la misma orden que NO comparten clave de idempotencia, así que la tabla de
 * idempotencia no los junta. Lo que los separa es el `where estado in (…cobrables)` de
 * `marcarPagada`: el segundo —que leyó la orden cuando todavía era cobrable— espera al
 * primero en la fila de la orden, Postgres re-evalúa ese `where` sobre la orden ya pagada,
 * actualiza cero filas y el cobro se revierte entero: pagos, movimiento de caja, stock y
 * folio. (El `for update` de `bloquear_orden` los forma antes, pero está ahí por la
 * remisión: quitarlo no rompe esta propiedad, y la mutación lo confirma.)
 *
 * La base falsa no puede probar esto: no tiene bloqueos ni re-evalúa un `where` después de
 * esperar a otra transacción. Es exactamente el comportamiento del motor.
 *
 * ── Por qué hay DOS casos ─────────────────────────────────────────────────
 * Lo destapó la mutación. Con mercancía en la orden, quitar el `where` de `marcarPagada`
 * NO se veía: el segundo cobro chocaba antes con `movimientos_stock_idempotencia`, la
 * clave del kardex por línea de orden, y se revertía con un 23505. Es una segunda guarda,
 * buena, pero sólo existe cuando la orden lleva algo que sale del almacén. Una recarga de
 * tiempo aire —lo más vendido de una tiendita— no escribe kardex, y ahí el `where` es lo
 * ÚNICO que impide cobrarla dos veces. El primer caso es ése; el segundo comprueba que con
 * mercancía el anaquel tampoco suelta dos veces.
 */

let negocio: NegocioReal;
let sucursal: SucursalReal;

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Abarrotes del Doble Clic', rol: 'cajero' });
  sucursal = await sembrarSucursal(negocio, { terminales: ['Caja 1'] });
  await abrirCajaReal(ambito());
});

function ambito() {
  return ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
}

/** Los dos cobros, con claves distintas, formados en la fila de la orden. */
function cobrarDosVeces(ordenId: string, totalCentavos: number) {
  return enCarrera(
    (tx) =>
      tx
        .selectFrom('ordenes')
        .select('id')
        .where('id', '=', ordenId)
        .forUpdate()
        .executeTakeFirstOrThrow(),
    [
      () => cobrarEnEfectivo(ambito(), ordenId, totalCentavos),
      () => cobrarEnEfectivo(ambito(), ordenId, totalCentavos),
    ],
  );
}

/** Un juego de pagos, una venta pagada con el folio de la ganadora, un folio gastado. */
async function exigirUnSoloCobro(
  ordenId: string,
  totalCentavos: number,
  folioGanador: { readonly serie: string; readonly folio: string },
): Promise<void> {
  const db = obtenerDb();
  const pagos = await db
    .selectFrom('pagos')
    .select(['metodo', 'monto_centavos'])
    .where('orden_id', '=', ordenId)
    .execute();
  expect(pagos).toEqual([{ metodo: 'efectivo', monto_centavos: BigInt(totalCentavos) }]);

  const orden = await db
    .selectFrom('ordenes')
    .select(['estado', 'serie', 'folio', 'total_centavos'])
    .where('id', '=', ordenId)
    .executeTakeFirstOrThrow();
  expect(orden).toEqual({
    estado: 'pagada',
    serie: folioGanador.serie,
    folio: BigInt(folioGanador.folio),
    total_centavos: BigInt(totalCentavos),
  });

  // Un solo folio gastado: el de la perdedora volvió atrás con su reversión.
  const folio = await db
    .selectFrom('folios')
    .select('siguiente')
    .where('sucursal_id', '=', sucursal.sucursalId)
    .where('serie', '=', folioGanador.serie)
    .executeTakeFirstOrThrow();
  expect(folio.siguiente).toBe(BigInt(folioGanador.folio) + 1n);

  // Y el cajón recibió la venta una vez.
  const entradas = await db
    .selectFrom('movimientos_caja')
    .select('monto_centavos')
    .where('referencia_tipo', '=', 'orden')
    .where('referencia_id', '=', ordenId)
    .where('tipo', '=', 'venta')
    .execute();
  expect(entradas).toEqual([{ monto_centavos: BigInt(totalCentavos) }]);
}

describe('el cobro doble · dos cobros simultáneos de la misma orden', () => {
  it('sin mercancía (una recarga): uno cobra y el otro se revierte entero', async () => {
    const recarga = await sembrarSinInventario(negocio, {
      nombre: 'Recarga $100',
      precioCentavos: 10_000n,
    });
    const { ordenId, totalCentavos } = await armarVenta(ambito(), [
      { productoId: recarga, cantidad: '1' },
    ]);

    const resultados = await cobrarDosVeces(ordenId, totalCentavos);

    const ganadoras = resultados.filter((r) => r.ok);
    expect(ganadoras).toHaveLength(1);
    const perdedoras = resultados.filter((r) => !r.ok);
    expect(perdedoras).toHaveLength(1);
    // La que perdió lo oye con palabras: «ya se cobró», no «Algo falló de nuestro lado».
    const perdedora = perdedoras[0];
    if (perdedora === undefined || perdedora.ok) return;
    expect(perdedora.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(perdedora.error.datos?.['regla']).toBe('ORDEN_NO_EDITABLE');
    const ganadora = ganadoras[0];
    if (!ganadora?.ok) return;
    await exigirUnSoloCobro(ordenId, totalCentavos, ganadora.datos);
  });

  it('con mercancía: además, el anaquel suelta la pieza una sola vez', async () => {
    const refresco = await sembrarProducto(negocio, sucursal.almacenId, {
      nombre: 'Refresco 600 ml',
      precioCentavos: 1_850n,
      // De sobra: si se acabara con el primer cobro, el segundo caería por
      // STOCK_INSUFICIENTE y esto no diría nada del cobro doble.
      existencia: '50',
    });
    const { ordenId, totalCentavos } = await armarVenta(ambito(), [
      { productoId: refresco.productoId, cantidad: '1' },
    ]);

    const resultados = await cobrarDosVeces(ordenId, totalCentavos);

    const ganadoras = resultados.filter((r) => r.ok);
    expect(ganadoras).toHaveLength(1);
    // Aquí la perdedora NO llega a `marcarPagada`: choca antes con la clave del kardex
    // (23505) y todavía oye «Algo falló de nuestro lado». El dinero queda bien —se revierte
    // entera—; lo que falta es que `cobrar.ts` vuelva a mirar el estado DESPUÉS de bloquear
    // la orden. Por eso aquí no se afirma el código de la perdedora.
    const ganadora = ganadoras[0];
    if (!ganadora?.ok) return;
    await exigirUnSoloCobro(ordenId, totalCentavos, ganadora.datos);

    const salidas = await obtenerDb()
      .selectFrom('movimientos_stock')
      .select('cantidad')
      .where('insumo_id', '=', refresco.insumoId)
      .execute();
    expect(salidas).toEqual([{ cantidad: '-1.0000' }]);
    const existencia = await obtenerDb()
      .selectFrom('existencias')
      .select('cantidad')
      .where('insumo_id', '=', refresco.insumoId)
      .executeTakeFirstOrThrow();
    expect(existencia.cantidad).toBe('49.0000');
  });
});
