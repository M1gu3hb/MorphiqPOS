import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb, repoCaja } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { registrarPagoCredito } from '../cartera/cobranza.ts';
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
import { registrarRemision } from './credito.ts';
import { crearNotaMostrador } from './nota-de-mostrador.ts';

/**
 * LA VENTA A CRÉDITO Y SU PAGO, contra Postgres (181, bloque D de la 2.4).
 *
 * `ferreteria/02-DINERO-Y-CAJA` §1 y §6.3: la remisión firmada ES venta del día —folio,
 * salida de almacén, método `credito`— y NO entra dinero al cajón; el pago de esa remisión
 * en efectivo SÍ entra al cajón y NO es venta. Son los dos renglones de la «prueba 1» que
 * una ferretería tiene y una tiendita casi no: venta sin dinero y dinero sin venta.
 *
 * Contra la base de verdad porque lo que puede romperlo vive en ella: `pagos_metodo_check`
 * (003) no conocía `credito` hasta la 181, `orden_pagada_con_folio` y
 * `orden_cerrada_con_fecha` exigen el cierre completo, y `movimiento_signo_coherente` el
 * signo del depósito. La base falsa no mira ningún `check`.
 */

let negocio: NegocioReal;
let ambito: ReturnType<typeof ambitoDe>;
let productoId: string;
let insumoId: string;
let clienteId: string;
let sesionCajaId: string;

const FONDO = 100_000;
const PRECIO = 89_900n;

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Ferretería del Crédito',
    rol: 'cajero',
    giro: 'ferreteria',
    paquete: 'ferreteria',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Mostrador'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  ({ productoId, insumoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Pintura vinílica blanca 19 L',
    precioCentavos: PRECIO,
    existencia: '10',
  }));
  clienteId = randomUUID();
  await conTransaccion((tx) =>
    tx
      .insertInto('clientes')
      .values({
        id: clienteId,
        organizacion_id: negocio.organizacionId,
        nombre: 'Ing. Loera',
        limite_credito_centavos: 2_000_000n,
        dias_plazo: 30,
      })
      .execute(),
  );
  sesionCajaId = await abrirCajaReal(ambito, FONDO);
});

/** Arma la nota del mostrador y la firma a crédito, por los comandos de producción. */
async function remitir(cantidad: number): Promise<{ ordenId: string; total: number }> {
  const nota = exigirOk(
    await comando(crearNotaMostrador, {
      entrada: { clienteId, partidas: [{ productoId, cantidad }] },
      ambito,
      idempotencyKey: clave(),
    }),
    'ferreteria.crear_nota_mostrador',
  );
  const total = Number(nota.totalCentavos);
  exigirOk(
    await comando(registrarRemision, {
      entrada: {
        ordenId: nota.ordenId,
        clienteId,
        importeCentavos: total,
        nombreFirmante: 'Martín Pérez',
      },
      ambito,
      idempotencyKey: clave(),
    }),
    'credito.registrar_remision',
  );
  return { ordenId: nota.ordenId, total };
}

async function esperadoDelCajon(): Promise<bigint> {
  const arqueo = await repoCaja.arqueoDeSesion(obtenerDb(), negocio.organizacionId, sesionCajaId);
  return arqueo.efectivoEsperadoCentavos;
}

describe('la venta a crédito de la ferretería y su pago, en la base', () => {
  it('la remisión es VENTA: pagada, con folio, pago `credito`, salida de almacén y el cajón quieto', async () => {
    const { ordenId, total } = await remitir(2);
    expect(total).toBe(Number(PRECIO) * 2);

    const orden = await obtenerDb()
      .selectFrom('ordenes')
      .select(['estado', 'serie', 'folio', 'total_centavos', 'sesion_caja_id', 'cliente_id'])
      .where('id', '=', ordenId)
      .executeTakeFirstOrThrow();
    expect(orden.estado).toBe('pagada');
    expect(orden.serie).toBe('A');
    expect(orden.folio).not.toBeNull();
    expect(orden.total_centavos).toBe(PRECIO * 2n);
    // Cuenta en el corte de la caja de esta terminal…
    expect(orden.sesion_caja_id).toBe(sesionCajaId);
    expect(orden.cliente_id).toBe(clienteId);

    const pagos = await obtenerDb()
      .selectFrom('pagos')
      .select(['metodo', 'monto_centavos', 'sesion_caja_id'])
      .where('orden_id', '=', ordenId)
      .execute();
    expect(pagos).toEqual([
      { metodo: 'credito', monto_centavos: PRECIO * 2n, sesion_caja_id: sesionCajaId },
    ]);

    // …y no le mete un peso: la única entrada de esa caja es su fondo.
    const movimientos = await obtenerDb()
      .selectFrom('movimientos_caja')
      .select(['tipo'])
      .where('sesion_caja_id', '=', sesionCajaId)
      .execute();
    expect(movimientos.map((m) => m.tipo)).toEqual(['apertura']);
    expect(await esperadoDelCajon()).toBe(BigInt(FONDO));

    // El material salió por la puerta: el almacén lo sabe, con su renglón en el ledger.
    const existencia = await obtenerDb()
      .selectFrom('existencias')
      .select(['cantidad'])
      .where('insumo_id', '=', insumoId)
      .executeTakeFirstOrThrow();
    expect(Number(existencia.cantidad)).toBe(8);
    const salida = await obtenerDb()
      .selectFrom('movimientos_stock')
      .select(['tipo', 'cantidad'])
      .where('insumo_id', '=', insumoId)
      .where('referencia_id', '=', ordenId)
      .execute();
    expect(salida.map((m) => [m.tipo, Number(m.cantidad)])).toEqual([['salida_venta', -2]]);

    // Y la deuda quedó a nombre del contratista.
    const cliente = await obtenerDb()
      .selectFrom('clientes')
      .select(['saldo_pendiente_centavos'])
      .where('id', '=', clienteId)
      .executeTakeFirstOrThrow();
    expect(cliente.saldo_pendiente_centavos).toBe(PRECIO * 2n);
  });

  it('el pago de la remisión en efectivo ENTRA al cajón como depósito y no es venta', async () => {
    const antes = await esperadoDelCajon();
    const debe = (
      await obtenerDb()
        .selectFrom('clientes')
        .select(['saldo_pendiente_centavos'])
        .where('id', '=', clienteId)
        .executeTakeFirstOrThrow()
    ).saldo_pendiente_centavos;
    const ventasAntes = await obtenerDb()
      .selectFrom('ordenes')
      .select(['id'])
      .where('organizacion_id', '=', negocio.organizacionId)
      .where('estado', '=', 'pagada')
      .execute();

    exigirOk(
      await comando(registrarPagoCredito, {
        entrada: { clienteId, montoCentavos: Number(debe), metodo: 'efectivo' },
        ambito,
        idempotencyKey: clave(),
      }),
      'credito.registrar_pago',
    );

    expect(await esperadoDelCajon()).toBe(antes + debe);
    const deposito = await obtenerDb()
      .selectFrom('movimientos_caja')
      .select(['tipo', 'monto_centavos', 'referencia_tipo'])
      .where('sesion_caja_id', '=', sesionCajaId)
      .where('tipo', '=', 'deposito')
      .execute();
    expect(deposito).toEqual([
      { tipo: 'deposito', monto_centavos: debe, referencia_tipo: 'pago_credito' },
    ]);
    // No es venta: ni una orden pagada más.
    const ventasDespues = await obtenerDb()
      .selectFrom('ordenes')
      .select(['id'])
      .where('organizacion_id', '=', negocio.organizacionId)
      .where('estado', '=', 'pagada')
      .execute();
    expect(ventasDespues).toHaveLength(ventasAntes.length);
    const saldo = await obtenerDb()
      .selectFrom('clientes')
      .select(['saldo_pendiente_centavos'])
      .where('id', '=', clienteId)
      .executeTakeFirstOrThrow();
    expect(saldo.saldo_pendiente_centavos).toBe(0n);
  });
});
