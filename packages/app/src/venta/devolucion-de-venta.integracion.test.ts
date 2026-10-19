import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { enCarrera } from '../pruebas/carrera.ts';
import {
  abrirCajaReal,
  ambitoDe,
  armarVenta,
  clave,
  cobrarEnEfectivo,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { devolverVenta } from './devolucion-de-venta.ts';

/**
 * D-29 · LA DEVOLUCIÓN DE VENTA contra Postgres (178, bloque D.9 de la 2.4).
 *
 * `devolucion-de-venta.test.ts` prueba las cuentas sobre la base falsa: el importe
 * acumulado, el método, lo que regresa al almacén. Lo que la base falsa NO puede probar es
 * lo único que separa una devolución de un robo cuando dos personas la hacen a la vez: el
 * `for update` sobre la orden. Sin él, dos devoluciones parciales de la misma línea leen
 * «nada devuelto todavía» cada una, las dos pasan la comprobación acumulada, y entre las
 * dos sale del cajón más de lo que entró por esa línea.
 *
 * La venta lleva DOS líneas a propósito. Con una sola, el tope por método —«no se devuelve
 * por efectivo más de lo que entró por efectivo»— taparía el hueco por su cuenta y la
 * prueba no distinguiría si la guarda de la LÍNEA existe. Con dos, lo cobrado de sobra
 * alcanza para pagar la devolución de más, y lo único que la detiene es la suma de lo
 * devuelto de esa línea.
 */

const ACEITE_CENTAVOS = 4_550n;
const ARROZ_CENTAVOS = 10_000n;

let ambito: ReturnType<typeof ambitoDe>;
let sesionCajaId: string;
let aceiteInsumo: string;
let almacenId: string;
let ordenId: string;
let lineaAceite: string;

beforeAll(async () => {
  // Gerente: la cajera no devuelve (§8.3 de cada giro), y la misma persona cobra antes.
  const negocio = await sembrarNegocio({ nombre: 'Abarrotes de la Devolución', rol: 'gerente' });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja 1'] });
  almacenId = sucursal.almacenId;
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);

  const aceite = await sembrarProducto(negocio, almacenId, {
    nombre: 'Aceite 1 L',
    precioCentavos: ACEITE_CENTAVOS,
    existencia: '10',
  });
  aceiteInsumo = aceite.insumoId;
  const arroz = await sembrarProducto(negocio, almacenId, {
    nombre: 'Arroz 1 kg',
    precioCentavos: ARROZ_CENTAVOS,
    existencia: '10',
  });

  sesionCajaId = await abrirCajaReal(ambito);
  const venta = await armarVenta(ambito, [
    { productoId: aceite.productoId, cantidad: '3' },
    { productoId: arroz.productoId, cantidad: '1' },
  ]);
  ordenId = venta.ordenId;
  exigirOk(await cobrarEnEfectivo(ambito, ordenId, venta.totalCentavos), 'venta.cobrar');

  const linea = await obtenerDb()
    .selectFrom('orden_lineas')
    .select('id')
    .where('orden_id', '=', ordenId)
    .where('producto_id', '=', aceite.productoId)
    .executeTakeFirstOrThrow();
  lineaAceite = linea.id;
});

function devolverAceite(cantidad: string) {
  return comando(devolverVenta, {
    entrada: {
      ordenId,
      lineas: [{ ordenLineaId: lineaAceite, cantidad }],
      metodo: 'efectivo',
      motivo: 'Venía abierto',
    },
    ambito,
    idempotencyKey: clave(),
  });
}

async function devueltoDeLaLinea(): Promise<{ cantidad: number; monto: bigint }> {
  const filas = await obtenerDb()
    .selectFrom('devoluciones_lineas')
    .select(['cantidad', 'monto_centavos'])
    .where('orden_linea_id', '=', lineaAceite)
    .execute();
  return {
    cantidad: filas.reduce((suma, f) => suma + Number(f.cantidad), 0),
    monto: filas.reduce((suma, f) => suma + f.monto_centavos, 0n),
  };
}

describe('D-29 · la devolución de venta contra Postgres', () => {
  it('dos devoluciones parciales A LA VEZ de la misma línea, que juntas pasan lo vendido: una sola sale del cajón', async () => {
    // La barrera: la orden bloqueada por la prueba. Las dos devoluciones se forman en el
    // `for update` de `bloquear_orden` —o, si alguien lo quitara, en la llave foránea de
    // `devoluciones` hacia la orden, ya con «nada devuelto» leído—.
    const [a, b] = await enCarrera(
      (tx) =>
        tx
          .selectFrom('ordenes')
          .select('id')
          .where('id', '=', ordenId)
          .forUpdate()
          .executeTakeFirstOrThrow(),
      [() => devolverAceite('2'), () => devolverAceite('2')],
    );

    const ganadoras = [a, b].filter((r) => r?.ok);
    const perdedoras = [a, b].filter((r) => r !== undefined && !r.ok);
    expect(ganadoras).toHaveLength(1);
    expect(perdedoras).toHaveLength(1);
    const perdedora = perdedoras[0];
    if (perdedora === undefined || perdedora.ok) return;
    expect(perdedora.error.datos?.['regla']).toBe('CANTIDAD_INVALIDA');

    const ganadora = ganadoras[0];
    if (!ganadora?.ok) return;
    // Dos de tres aceites, al centavo: 2 × 45.50.
    expect(ganadora.datos.montoCentavos).toBe(String(2n * ACEITE_CENTAVOS));
    expect(ganadora.datos.estado).toBe('parcialmente_reembolsada');

    // Lo devuelto de la línea nunca pasa de lo vendido, ni en piezas ni en dinero.
    expect(await devueltoDeLaLinea()).toEqual({ cantidad: 2, monto: 2n * ACEITE_CENTAVOS });

    // El efectivo sale del cajón de ESTA caja, referido a SU documento y una sola vez.
    const salidas = await obtenerDb()
      .selectFrom('movimientos_caja')
      .select(['tipo', 'monto_centavos', 'referencia_id', 'sesion_caja_id'])
      .where('referencia_tipo', '=', 'devolucion')
      .where('sesion_caja_id', '=', sesionCajaId)
      .execute();
    expect(salidas).toEqual([
      {
        tipo: 'devolucion',
        monto_centavos: -2n * ACEITE_CENTAVOS,
        referencia_id: ganadora.datos.devolucionId,
        sesion_caja_id: sesionCajaId,
      },
    ]);

    // La mercancía regresa al anaquel con un movimiento POSITIVO de su documento.
    const regresos = await obtenerDb()
      .selectFrom('movimientos_stock')
      .select(['tipo', 'cantidad', 'insumo_id'])
      .where('referencia_tipo', '=', 'devolucion')
      .where('referencia_id', '=', ganadora.datos.devolucionId)
      .execute();
    expect(regresos).toEqual([{ tipo: 'devolucion', cantidad: '2.0000', insumo_id: aceiteInsumo }]);
    const existencia = await obtenerDb()
      .selectFrom('existencias')
      .select('cantidad')
      .where('almacen_id', '=', almacenId)
      .where('insumo_id', '=', aceiteInsumo)
      .executeTakeFirstOrThrow();
    // 10 en el anaquel, 3 vendidos, 2 de vuelta.
    expect(existencia.cantidad).toBe('9.0000');
  });

  it('lo que queda de la línea se devuelve después hasta el centavo, y ni una pieza más', async () => {
    // La perdedora de la carrera no se llevó nada: el aceite que queda sigue devolvible.
    const resto = await devolverAceite('1');
    expect(exigirOk(resto, 'venta.devolver_venta').montoCentavos).toBe(String(ACEITE_CENTAVOS));
    // A pedazos suma EXACTAMENTE lo que se cobró de la línea.
    expect(await devueltoDeLaLinea()).toEqual({ cantidad: 3, monto: 3n * ACEITE_CENTAVOS });

    const otra = await devolverAceite('1');
    expect(otra.ok).toBe(false);
    if (otra.ok) return;
    expect(otra.error.datos?.['regla']).toBe('CANTIDAD_INVALIDA');
  });
});
