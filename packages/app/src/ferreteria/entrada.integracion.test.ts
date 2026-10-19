import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb, repoCaja } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  abrirCajaReal,
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { recibirEntrada } from './entrada.ts';

/**
 * LA COMPRA DE CONTADO SALE DEL CAJÓN, contra Postgres (bloque D de la 2.4).
 *
 * `ferreteria/02-DINERO-Y-CAJA` §8.3 —«Compra de contado al proveedor · − monto»— y la
 * prueba 1 de su §1 —«− gastos y compras de contado»—. La entrada de contado guardaba
 * «efectivo» en la compra y no movía el cajón: el arqueo esperaba el dinero que ya se
 * había llevado el repartidor. Contra la base de verdad porque el movimiento tiene que
 * caber en `movimientos_caja_tipo_check`, en la referencia `pago_proveedor` de la 162 y
 * en `movimiento_signo_coherente`, y la base falsa no mira ningún `check`.
 */

let negocio: NegocioReal;
let ambito: ReturnType<typeof ambitoDe>;
let sinCaja: ReturnType<typeof ambitoDe>;
let insumoId: string;
let proveedorId: string;
let sesionCajaId: string;

const FONDO = 100_000;

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Ferretería de Contado',
    rol: 'gerente',
    giro: 'ferreteria',
    paquete: 'ferreteria',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  ({ insumoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Martillo uña pulida 16 oz',
    precioCentavos: 18_900n,
    existencia: '5',
  }));
  // Otra sucursal, con su almacén y SIN caja abierta.
  const otra = await sembrarSucursal(negocio, { terminales: ['Bodega'] });
  sinCaja = ambitoDe(negocio, otra.sucursalId, otra.terminales[0] ?? null);
  proveedorId = randomUUID();
  await conTransaccion((tx) =>
    tx
      .insertInto('proveedores')
      .values({
        id: proveedorId,
        organizacion_id: negocio.organizacionId,
        nombre: 'Ferretera del Valle',
        dias_credito: 30,
      })
      .execute(),
  );
  sesionCajaId = await abrirCajaReal(ambito, FONDO);
});

const entrada = (cambios: Record<string, unknown> = {}) => ({
  proveedorId,
  folio: null,
  aCredito: false,
  dias: null,
  camino: 'manual' as const,
  lineas: [
    {
      insumoId,
      cantidadCapturada: '2',
      unidadCapturada: 'pieza',
      equivalencia: '1',
      costoTotal: '191.00',
    },
  ],
  ...cambios,
});

async function esperadoDelCajon(): Promise<bigint> {
  const arqueo = await repoCaja.arqueoDeSesion(obtenerDb(), negocio.organizacionId, sesionCajaId);
  return arqueo.efectivoEsperadoCentavos;
}

describe('la entrada del proveedor y el cajón, en la base', () => {
  it('DE CONTADO: el cajón baja lo que se le pagó al repartidor, con su referencia a la compra', async () => {
    const antes = await esperadoDelCajon();
    const { compraId } = exigirOk(
      await comando(recibirEntrada, { entrada: entrada(), ambito, idempotencyKey: clave() }),
      'compras.recibir_entrada',
    );

    expect(await esperadoDelCajon()).toBe(antes - 19_100n);
    const movimiento = await obtenerDb()
      .selectFrom('movimientos_caja')
      .select(['tipo', 'monto_centavos', 'referencia_tipo', 'referencia_id'])
      .where('sesion_caja_id', '=', sesionCajaId)
      .where('referencia_tipo', '=', 'pago_proveedor')
      .execute();
    expect(movimiento).toEqual([
      {
        tipo: 'gasto',
        monto_centavos: -19_100n,
        referencia_tipo: 'pago_proveedor',
        referencia_id: compraId,
      },
    ]);
  });

  it('A CRÉDITO: el cajón no se mueve', async () => {
    const antes = await esperadoDelCajon();
    exigirOk(
      await comando(recibirEntrada, {
        entrada: entrada({ aCredito: true, folio: `FV-${clave().slice(0, 6)}`, dias: 30 }),
        ambito,
        idempotencyKey: clave(),
      }),
      'compras.recibir_entrada',
    );
    expect(await esperadoDelCajon()).toBe(antes);
  });

  it('de contado SIN caja abierta no se registra: ni compra, ni material', async () => {
    const compras = () =>
      obtenerDb()
        .selectFrom('compras')
        .select(['id'])
        .where('organizacion_id', '=', negocio.organizacionId)
        .execute();
    const antes = (await compras()).length;

    const salida = await comando(recibirEntrada, {
      entrada: entrada(),
      ambito: sinCaja,
      idempotencyKey: clave(),
    });

    // `CAJA_CERRADA` sale por la puerta como regla de negocio, con su motivo dicho.
    expect(salida.ok).toBe(false);
    expect(salida.ok ? null : salida.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(salida.ok ? '' : salida.error.mensaje).toMatch(/No hay una caja abierta/);
    expect(await compras()).toHaveLength(antes);
  });
});
