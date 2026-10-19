import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

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
import { cancelarApartada, suspenderVenta } from '../venta/suspender.ts';
import { cerrarCaja } from './sesion.ts';

/**
 * F-224 · NO SE CIERRA LA CAJA CON VENTAS APARTADAS, contra Postgres (bloque D de la 2.4).
 *
 * «No se puede cerrar con ventas en espera» (`abarrotes/02-DINERO-Y-CAJA §8.5`): el ticket
 * apartado del cliente que no volvió se cobra o se cancela con motivo antes del corte. Pero
 * la regla es de ESTA caja: lo apartado en la terminal de al lado es del corte de al lado,
 * y lo ya cobrado no está en espera de nada. Si la regla contara de más, la tienda no podría
 * cerrar nunca mientras otra caja tenga a alguien buscando el pan.
 *
 * La venta apartada de la otra terminal se arma y se aparta sin caja abierta: apartar no
 * toca el cajón, y así la sucursal se queda con su cupo de una caja.
 */

let ambitoA: ReturnType<typeof ambitoDe>;
let ambitoB: ReturnType<typeof ambitoDe>;
let productoId: string;
let fondoMasVentas = 0;

beforeAll(async () => {
  const negocio = await sembrarNegocio({ nombre: 'Abarrotes del Corte', rol: 'cajero' });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja 1', 'Caja 2'] });
  ambitoA = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  ambitoB = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[1] ?? null);
  ({ productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Leche 1 L',
    precioCentavos: 2_900n,
    existencia: '20',
  }));
  await abrirCajaReal(ambitoA, 50_000);
  fondoMasVentas = 50_000;
});

async function apartar(ambito: ReturnType<typeof ambitoDe>): Promise<string> {
  const { ordenId } = await armarVenta(ambito, [{ productoId, cantidad: '1' }]);
  const { codigo } = exigirOk(
    await comando(suspenderVenta, {
      entrada: { ordenId, nota: null },
      ambito,
      idempotencyKey: clave(),
    }),
    'venta.suspender',
  );
  return codigo;
}

function cerrar() {
  return comando(cerrarCaja, {
    entrada: { efectivoContadoCentavos: fondoMasVentas },
    ambito: ambitoA,
    idempotencyKey: clave(),
  });
}

describe('F-224 · el corte con ventas apartadas', () => {
  it('con una apartada en ESTA caja no cierra; lo cobrado y lo apartado en la otra no cuentan', async () => {
    // La de la terminal de al lado, apartada.
    await apartar(ambitoB);
    // Una cobrada en esta caja.
    const cobrada = await armarVenta(ambitoA, [{ productoId, cantidad: '1' }]);
    exigirOk(
      await cobrarEnEfectivo(ambitoA, cobrada.ordenId, cobrada.totalCentavos),
      'venta.cobrar',
    );
    fondoMasVentas += cobrada.totalCentavos;
    // Y una apartada en esta caja.
    const codigo = await apartar(ambitoA);

    const conApartada = await cerrar();
    expect(conApartada.ok).toBe(false);
    if (conApartada.ok) return;
    expect(conApartada.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(conApartada.error.datos?.['regla']).toBe('TRANSICION_INVALIDA');
    // UNA: la de esta terminal. Ni la cobrada ni la de la otra caja. (El envoltorio sólo
    // deja pasar la regla en `datos`; la cuenta viaja en el mensaje.)
    expect(conApartada.error.mensaje).toContain('Hay 1 venta(s) apartada(s) en esta caja');

    exigirOk(
      await comando(cancelarApartada, {
        entrada: { codigo, motivo: 'No regresó el cliente' },
        ambito: ambitoA,
        idempotencyKey: clave(),
      }),
      'venta.cancelar_apartada',
    );

    // Con la de al lado todavía apartada, esta caja cierra, y cuadra al centavo.
    const corte = exigirOk(await cerrar(), 'caja.cerrar');
    expect(corte.diferenciaCentavos).toBe('0');
    expect(corte.numeroVentas).toBe(1);
    const otra = await obtenerDb()
      .selectFrom('ordenes')
      .select('estado')
      .where('terminal_id', '=', ambitoB.terminalId)
      .execute();
    expect(otra).toEqual([{ estado: 'suspendida' }]);
  });
});
