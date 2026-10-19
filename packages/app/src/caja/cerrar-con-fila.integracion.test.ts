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
import { cerrarCaja } from './sesion.ts';

/**
 * F-262 · NO SE CIERRA EL TURNO CON PEDIDOS COBRADOS SIN ENTREGAR, contra Postgres (bloque D
 * de la 2.4).
 *
 * La regla la guarda un disparador (`086_turno_bote_y_cambio.sql`), y su `check_violation`
 * llegaba a la cajera de la cafetería como «Error interno»: el turno no cerraba y la pantalla
 * no decía por qué. El cierre la cuenta antes, igual que el disparador, y la dice con
 * palabras. Sólo se ve aquí: la base falsa no tiene disparadores.
 */

let ambito: ReturnType<typeof ambitoDe>;
let sucursalId: string;
let ordenId: string;
let esperado = 0;

beforeAll(async () => {
  const negocio = await sembrarNegocio({ nombre: 'Café de la Fila', rol: 'cajero' });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Barra'] });
  sucursalId = sucursal.sucursalId;
  ambito = ambitoDe(negocio, sucursalId, sucursal.terminales[0] ?? null);
  const { productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Latte',
    precioCentavos: 6_500n,
    existencia: '20',
  });
  await abrirCajaReal(ambito, 50_000);
  const venta = await armarVenta(ambito, [{ productoId, cantidad: '1' }]);
  exigirOk(await cobrarEnEfectivo(ambito, venta.ordenId, venta.totalCentavos), 'venta.cobrar');
  ordenId = venta.ordenId;
  esperado = 50_000 + venta.totalCentavos;
});

function cerrar() {
  return comando(cerrarCaja, {
    entrada: { efectivoContadoCentavos: esperado },
    ambito,
    idempotencyKey: clave(),
  });
}

describe('F-262 · el cierre con pedidos en la fila', () => {
  it('con un latte cobrado y sin entregar no cierra, y lo dice; entregado, cierra', async () => {
    const [comanda] = await obtenerDb()
      .insertInto('comandas')
      .values({
        organizacion_id: ambito.organizacionId,
        orden_id: ordenId,
        sucursal_id: sucursalId,
        estado: 'listo',
        cobrado_en: new Date(),
      })
      .returning('id')
      .execute();
    if (comanda === undefined) throw new Error('No se sembró la comanda.');

    const conPendiente = await cerrar();
    expect(conPendiente.ok).toBe(false);
    if (conPendiente.ok) return;
    // Una regla con palabras, no «Error interno».
    expect(conPendiente.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(conPendiente.error.datos?.['regla']).toBe('TRANSICION_INVALIDA');
    expect(conPendiente.error.mensaje).toContain('Hay 1 pedido(s) cobrado(s) sin entregar');

    await obtenerDb()
      .updateTable('comandas')
      .set({ estado: 'entregado', entregada_en: new Date() })
      .where('id', '=', comanda.id)
      .execute();

    const corte = exigirOk(await cerrar(), 'caja.cerrar');
    expect(corte.diferenciaCentavos).toBe('0');
  });
});
