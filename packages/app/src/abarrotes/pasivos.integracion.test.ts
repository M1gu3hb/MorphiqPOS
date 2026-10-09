import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  abrirCajaReal,
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { moverDepositoEnvase, registrarComision } from './pasivos.ts';

/**
 * EL DINERO AJENO DEL MOSTRADOR, contra Postgres (F-255 y F-256, bloque D de la 2.4).
 *
 * El día completo de la tienda encontró que NINGUNA recarga ni ningún recibo de luz se
 * podía cobrar: `operaciones_comision.tipo` recibía el tipo de SERVICIO —«recarga»,
 * «pago_servicio»— y su `check` (095) sólo admite el de la OPERACIÓN —«venta», «compra_saldo»…—.
 * Postgres rechazaba con 23514 y la cajera veía «Algo falló de nuestro lado». Las pruebas
 * unitarias estaban en verde porque la base falsa no mira `check`; esto corre contra la de
 * verdad, que sí.
 *
 * Lo que se afirma de cada cobro es lo que el arqueo y el corte necesitan: la operación
 * anotada como `venta`, lo que se le debe al proveedor (recibido − comisión) en el ledger de
 * pasivos, y UN depósito en el cajón por todo lo recibido. Y del casco retornable, que el
 * depósito y su devolución quedan como dos renglones de signo contrario —el saldo vuelve a
 * cero— con su entrada y su salida del cajón.
 */

let negocio: NegocioReal;
let ambito: ReturnType<typeof ambitoDe>;
let sesionCajaId: string;

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Abarrotes del Dinero Ajeno', rol: 'cajero' });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja 1'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  sesionCajaId = await abrirCajaReal(ambito);
});

function cobrarServicio(entrada: {
  readonly tipo: 'recarga' | 'pago_servicio';
  readonly proveedorServicio: string;
  readonly referencia: string;
  readonly montoRecibidoCentavos: number;
  readonly comisionNegocioCentavos: number;
}) {
  return comando(registrarComision, { entrada, ambito, idempotencyKey: clave() });
}

async function loQueQuedoDe(pasivoId: string) {
  const db = obtenerDb();
  const pasivo = await db
    .selectFrom('pasivos_terceros')
    .select(['naturaleza', 'titular_tipo', 'monto_centavos', 'referencia_tipo', 'sesion_caja_id'])
    .where('id', '=', pasivoId)
    .executeTakeFirstOrThrow();
  const cajon = await db
    .selectFrom('movimientos_caja')
    .select(['tipo', 'monto_centavos', 'sesion_caja_id'])
    .where('referencia_tipo', '=', 'pasivo')
    .where('referencia_id', '=', pasivoId)
    .execute();
  return { pasivo, cajon };
}

async function operacionDe(proveedor: string) {
  return obtenerDb()
    .selectFrom('operaciones_comision')
    .innerJoin('comisionistas', 'comisionistas.id', 'operaciones_comision.comisionista_id')
    .select([
      'operaciones_comision.tipo as tipo',
      'operaciones_comision.monto_ajeno_centavos as ajeno',
      'operaciones_comision.comision_centavos as comision',
      'comisionistas.tipo as servicio',
      'comisionistas.modelo as modelo',
    ])
    .where('operaciones_comision.organizacion_id', '=', negocio.organizacionId)
    .where('comisionistas.nombre', '=', proveedor)
    .execute();
}

describe('F-255 · recargas y recibos contra Postgres', () => {
  it('una recarga de $200 con $6 de comisión: venta del comisionista, $194 ajenos y un depósito de $200', async () => {
    const salida = exigirOk(
      await cobrarServicio({
        tipo: 'recarga',
        proveedorServicio: 'Telcel',
        referencia: '5512345678',
        montoRecibidoCentavos: 20_000,
        comisionNegocioCentavos: 600,
      }),
      'comision.registrar',
    );

    expect(await operacionDe('Telcel')).toEqual([
      { tipo: 'venta', ajeno: 19_400n, comision: 600n, servicio: 'recarga', modelo: 'prepago' },
    ]);
    // Prepago: lo comprado por adelantado se GASTA.
    expect(salida.saldoDelComisionistaCentavos).toBe('-19400');

    const { pasivo, cajon } = await loQueQuedoDe(salida.pasivoId);
    expect(pasivo).toEqual({
      naturaleza: 'servicio_terceros',
      titular_tipo: 'proveedor',
      monto_centavos: 19_400n,
      referencia_tipo: 'recarga',
      sesion_caja_id: sesionCajaId,
    });
    expect(cajon).toEqual([
      { tipo: 'deposito', monto_centavos: 20_000n, sesion_caja_id: sesionCajaId },
    ]);
  });

  it('el recibo de la luz: venta del comisionista pospago, lo ajeno se DEBE y entra todo al cajón', async () => {
    const salida = exigirOk(
      await cobrarServicio({
        tipo: 'pago_servicio',
        proveedorServicio: 'CFE',
        referencia: '123456789012',
        montoRecibidoCentavos: 45_000,
        comisionNegocioCentavos: 1_000,
      }),
      'comision.registrar',
    );

    expect(await operacionDe('CFE')).toEqual([
      { tipo: 'venta', ajeno: 44_000n, comision: 1_000n, servicio: 'recibo', modelo: 'pospago' },
    ]);
    // Pospago: el dinero ajeno recibido se debe, y lo que se debe SUBE.
    expect(salida.saldoDelComisionistaCentavos).toBe('44000');

    const { pasivo, cajon } = await loQueQuedoDe(salida.pasivoId);
    expect(pasivo).toMatchObject({
      naturaleza: 'servicio_terceros',
      monto_centavos: 44_000n,
      referencia_tipo: 'pago_servicio',
    });
    expect(cajon).toEqual([
      { tipo: 'deposito', monto_centavos: 45_000n, sesion_caja_id: sesionCajaId },
    ]);
  });
});

describe('F-256 · el casco retornable contra Postgres', () => {
  it('el depósito y su devolución: dos renglones de signo contrario y su entrada y salida del cajón', async () => {
    const mover = (devolucion: boolean) =>
      comando(moverDepositoEnvase, {
        entrada: { montoCentavos: 300, cantidad: 1, devolucion },
        ambito,
        idempotencyKey: clave(),
      });

    const deposito = exigirOk(await mover(false), 'envase.mover_deposito');
    expect(deposito.saldoCentavos).toBe('300');
    const devolucion = exigirOk(await mover(true), 'envase.mover_deposito');
    // Lo que se le debe al portador vuelve a cero.
    expect(devolucion.saldoCentavos).toBe('0');

    const renglones = await obtenerDb()
      .selectFrom('pasivos_terceros')
      .select(['monto_centavos', 'titular_tipo', 'titular_id', 'referencia_tipo'])
      .where('organizacion_id', '=', negocio.organizacionId)
      .where('naturaleza', '=', 'envase_retornable')
      .orderBy('monto_centavos', 'desc')
      .execute();
    expect(renglones).toEqual([
      {
        monto_centavos: 300n,
        titular_tipo: 'portador',
        titular_id: null,
        referencia_tipo: 'deposito_envase',
      },
      {
        monto_centavos: -300n,
        titular_tipo: 'portador',
        titular_id: null,
        referencia_tipo: 'devolucion_envase',
      },
    ]);

    // Devolver el casco SACA dinero: un `retiro` negativo, no otro depósito.
    for (const [salida, esperado] of [
      [deposito, { tipo: 'deposito', monto_centavos: 300n }],
      [devolucion, { tipo: 'retiro', monto_centavos: -300n }],
    ] as const) {
      const { cajon } = await loQueQuedoDe(salida.pasivoId);
      expect(cajon).toEqual([{ ...esperado, sesion_caja_id: sesionCajaId }]);
    }
  });
});
