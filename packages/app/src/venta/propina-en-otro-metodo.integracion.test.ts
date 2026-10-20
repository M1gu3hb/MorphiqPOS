import { conTransaccion, obtenerDb, repoCaja } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { ventasPorMetodo } from '../caja/corte/consultas.ts';
import { comando } from '../produccion.ts';
import {
  abrirCajaReal,
  ambitoDe,
  armarVenta,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';
import { cobrarOrden } from './cobrar.ts';

/**
 * LA CUENTA CON TARJETA Y LA PROPINA SÓLO EN EFECTIVO, contra Postgres (cierre del restaurante).
 *
 * Lo más normal en una mesa: $X de cuenta con tarjeta y $30 en billete de propina. La pantalla
 * nueva lo rechazaba, la heredada se comía la propina y la base no admitía el renglón de
 * efectivo sin venta (`pagos_monto_centavos_check`, hasta la 184). Aquí se cobra por el
 * comando de producción y se mira lo PERSISTIDO: los dos renglones con su método, el cajón con
 * la propina y sin venta en efectivo, el arqueo, el corte por método y un reintento que no
 * duplica nada. Sin la 184 el cobro revienta con 23514; sin el cambio de `repartirPagos`, con
 * PAGO_NO_CUADRA.
 */

let negocio: NegocioReal;
let sucursal: SucursalReal;
let sesionCajaId: string;

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Mesa de la Propina en Billete', rol: 'cajero' });
  sucursal = await sembrarSucursal(negocio, { terminales: ['Caja 1'] });
  sesionCajaId = await abrirCajaReal(ambito(), 50_000);
});

function ambito() {
  return ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
}

describe('la cuenta con tarjeta y la propina sólo en efectivo', () => {
  it('se cobra, y cada peso queda donde fue', async () => {
    const platillo = await sembrarProducto(negocio, sucursal.almacenId, {
      nombre: 'Enchiladas suizas',
      precioCentavos: 18_500n,
      existencia: '20',
    });
    const { ordenId, totalCentavos } = await armarVenta(ambito(), [
      { productoId: platillo.productoId, cantidad: '1' },
    ]);
    const antes = await repoCaja.arqueoDeSesion(obtenerDb(), negocio.organizacionId, sesionCajaId);

    const idempotencyKey = clave();
    const cobrar = () =>
      comando(cobrarOrden, {
        entrada: {
          ordenId,
          pagos: [
            { metodo: 'tarjeta', montoCentavos: totalCentavos },
            // Sin venta: inventarle un centavo descuadraría la venta por método.
            {
              metodo: 'efectivo',
              montoCentavos: 0,
              propinaCentavos: 3_000,
              recibidoCentavos: 5_000,
            },
          ],
          totalEsperadoCentavos: totalCentavos,
          propinaOrigen: 'caja',
        },
        ambito: ambito(),
        idempotencyKey,
      });

    const cobrado = exigirOk(await cobrar(), 'venta.cobrar');
    // El billete de $50 por la propina de $30: $20 de cambio.
    expect(cobrado.cambioCentavos).toBe('2000');

    // El doble toque con la MISMA clave devuelve el mismo cobro, sin duplicar nada.
    const otraVez = exigirOk(await cobrar(), 'venta.cobrar (reintento)');
    expect(otraVez.cambioCentavos).toBe('2000');

    const db = obtenerDb();
    const pagos = await db
      .selectFrom('pagos')
      .select([
        'metodo',
        'monto_centavos',
        'propina_centavos',
        'recibido_centavos',
        'cambio_centavos',
      ])
      .where('orden_id', '=', ordenId)
      .orderBy('metodo')
      .execute();
    expect(pagos).toEqual([
      {
        metodo: 'efectivo',
        monto_centavos: 0n,
        propina_centavos: 3_000n,
        recibido_centavos: 5_000n,
        cambio_centavos: 2_000n,
      },
      {
        metodo: 'tarjeta',
        monto_centavos: BigInt(totalCentavos),
        propina_centavos: 0n,
        recibido_centavos: null,
        cambio_centavos: 0n,
      },
    ]);

    // El cajón: la propina en billete SÍ entra; venta en efectivo, ninguna.
    const movimientos = await db
      .selectFrom('movimientos_caja')
      .select(['tipo', 'monto_centavos'])
      .where('referencia_tipo', '=', 'orden')
      .where('referencia_id', '=', ordenId)
      .execute();
    expect(movimientos).toEqual([{ tipo: 'propina', monto_centavos: 3_000n }]);

    const despues = await repoCaja.arqueoDeSesion(db, negocio.organizacionId, sesionCajaId);
    expect(despues.efectivoEsperadoCentavos - antes.efectivoEsperadoCentavos).toBe(3_000n);
    expect(despues.ventasCentavos - antes.ventasCentavos).toBe(BigInt(totalCentavos));
    // Una venta, aunque sean dos renglones.
    expect(despues.numeroVentas - antes.numeroVentas).toBe(1);

    // El corte por método: la tarjeta con la venta, el efectivo sólo con la propina.
    const porMetodo = await conTransaccion((tx) =>
      ventasPorMetodo(tx, negocio.organizacionId, sesionCajaId),
    );
    expect(porMetodo).toContainEqual({
      metodo: 'tarjeta',
      ventasCentavos: String(totalCentavos),
      propinasCentavos: '0',
      pagos: 1,
    });
    expect(porMetodo).toContainEqual({
      metodo: 'efectivo',
      ventasCentavos: '0',
      propinasCentavos: '3000',
      pagos: 1,
    });

    // La orden: la venta intacta (la propina nunca la infla) y pagada una vez.
    const orden = await db
      .selectFrom('ordenes')
      .select(['estado', 'total_centavos'])
      .where('id', '=', ordenId)
      .executeTakeFirstOrThrow();
    expect(orden).toEqual({ estado: 'pagada', total_centavos: BigInt(totalCentavos) });
  });

  it('la base sigue sin admitir un renglón vacío', async () => {
    const platillo = await sembrarProducto(negocio, sucursal.almacenId, {
      nombre: 'Agua de horchata',
      precioCentavos: 4_500n,
      existencia: '20',
    });
    const { ordenId, totalCentavos } = await armarVenta(ambito(), [
      { productoId: platillo.productoId, cantidad: '1' },
    ]);

    const salida = await comando(cobrarOrden, {
      entrada: {
        ordenId,
        pagos: [
          { metodo: 'tarjeta', montoCentavos: totalCentavos },
          { metodo: 'efectivo', montoCentavos: 0 },
        ],
        totalEsperadoCentavos: totalCentavos,
      },
      ambito: ambito(),
      idempotencyKey: clave(),
    });

    expect(salida.ok).toBe(false);
    const pagos = await obtenerDb()
      .selectFrom('pagos')
      .select('id')
      .where('orden_id', '=', ordenId)
      .execute();
    expect(pagos).toEqual([]);
  });
});
