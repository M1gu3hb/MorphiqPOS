import { describe, expect, it } from 'vitest';

import {
  abrirCajaReal,
  ambitoDe,
  armarVenta,
  cobrarEnEfectivo,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { consultar } from './consultar.ts';

/**
 * LOS TOTALES DE CADA CORTE, contra Postgres (21-10).
 *
 * «Cortes de caja recientes» y Registros leen `CorteCaja` y pintan `total_general` y
 * `numero_ventas`. El mapa los declaraba derivados de los pagos de la sesión y nadie los
 * derivaba: cada corte decía «$0.00 · 0 tickets», también con dinero real.
 */
describe('los totales de una caja por el puente', () => {
  it('el corte lista lo cobrado en su caja, por método y en número de cuentas', async () => {
    const negocio = await sembrarNegocio({
      nombre: 'Fonda de los cortes',
      rol: 'dueno',
      giro: 'restaurante',
      paquete: 'restaurante',
    });
    const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
    const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
    const { productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
      nombre: 'Taco de pastor',
      precioCentavos: 3_500n,
      existencia: '50',
    });
    const caja = await abrirCajaReal(ambito);
    for (const cantidad of ['2', '3']) {
      const venta = await armarVenta(ambito, [{ productoId, cantidad }]);
      exigirOk(await cobrarEnEfectivo(ambito, venta.ordenId, venta.totalCentavos), 'venta.cobrar');
    }

    const cortes = await consultar(ambito, { entidad: 'CorteCaja', operacion: 'list' });
    const corte = cortes.find((c) => c['id'] === caja);
    expect(corte).toMatchObject({
      total_efectivo: 175,
      total_tarjeta: 0,
      total_general: 175,
      numero_ventas: 2,
    });
  });
});
