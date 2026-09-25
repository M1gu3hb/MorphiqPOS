import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import {
  ambitoDe,
  CUENTA,
  linea,
  ordenDeMesa,
  PREDETERMINADOS,
} from '../restaurante/pruebas/sala.ts';
import { cambiarCantidad, vaciarOrden } from './carrito.ts';
import { cantidadAConsumir, valorarPresentacion } from './presentacion.ts';

/**
 * F-147 · LA CAJA SE VENDE COMO CAJA (C.10 de la 2.4).
 *
 * El cobro de la tienda no sabía vender una presentación: el código de la caja de 24 no
 * encontraba nada, y `venta.agregar_linea` sólo vendía en la unidad del producto y a su
 * precio. Una caja cobrada como 24 piezas sale al precio de 24 piezas —casi nunca el de
 * la caja, que es por lo que se compra la caja— y una caja cobrada como una pieza
 * descuenta una.
 */

const REFRESCO = {
  nombre: 'Refresco 600',
  precioVentaCentavos: 1_800n,
  costoUnitarioCentavos: 1_200n,
};

describe('valorarPresentacion', () => {
  it('manda el precio de la caja y descuenta el factor en unidad base', () => {
    const valorada = valorarPresentacion(
      REFRESCO,
      { nombre: 'Caja', factor: '24', precioVentaCentavos: 38_000n },
      '2',
    );

    expect(valorada.precioUnitarioCentavos).toBe(38_000n);
    expect(valorada.subtotalCentavos).toBe(76_000n);
    // El costo de UNA caja: sin el factor, la utilidad saldría 24 veces inflada.
    expect(valorada.costoUnitarioCentavos).toBe(28_800n);
    expect(valorada.cantidadBaseConsumo).toBe('48.0000');
    expect(valorada.nombre).toBe('Refresco 600 · Caja');
    expect(valorada.unidad).toBe('Caja');
  });

  it('sin precio propio, se deriva del factor', () => {
    const valorada = valorarPresentacion(
      REFRESCO,
      { nombre: 'Six', factor: '6', precioVentaCentavos: null },
      '1',
    );
    expect(valorada.precioUnitarioCentavos).toBe(10_800n);
  });

  it('un factor fraccionario (el cigarro suelto) descuenta su fracción', () => {
    const valorada = valorarPresentacion(
      { nombre: 'Cajetilla', precioVentaCentavos: 8_000n, costoUnitarioCentavos: 6_000n },
      { nombre: 'Suelto', factor: '0.05', precioVentaCentavos: 500n },
      '3',
    );
    expect(valorada.cantidadBaseConsumo).toBe('0.1500');
    expect(valorada.subtotalCentavos).toBe(1_500n);
  });

  it('media caja no se vende', () => {
    const fallo = (() => {
      try {
        valorarPresentacion(
          REFRESCO,
          { nombre: 'Caja', factor: '24', precioVentaCentavos: null },
          '0.5',
        );
        return null;
      } catch (error: unknown) {
        return error;
      }
    })();
    expect(esErrorDominio(fallo) ? fallo.codigo : fallo).toBe('CANTIDAD_INVALIDA');
  });
});

describe('cantidadAConsumir', () => {
  it('una presentación descuenta su consumo en unidad base, sin convertir', () => {
    expect(
      cantidadAConsumir({ cantidad: '1', unidad: 'Caja', cantidadBaseConsumo: '24.0000' }, 'pieza'),
    ).toEqual({ cantidad: '24.0000', unidadVenta: 'pieza' });
  });

  it('una línea normal descuenta lo vendido en su unidad', () => {
    expect(
      cantidadAConsumir({ cantidad: '0.560', unidad: 'kg', cantidadBaseConsumo: null }, 'g'),
    ).toEqual({ cantidad: '0.560', unidadVenta: 'kg' });
  });
});

const baseDe = (estado = 'borrador') =>
  crearBaseFalsa(
    {
      ordenes: [ordenDeMesa(estado)],
      orden_lineas: [
        linea({ id: 'l1' }),
        linea({ id: 'l2', cantidad_base_consumo: '24.0000', unidad: 'Caja' }),
        linea({ id: 'ajena', orden_id: 'otra-orden' }),
      ],
      productos: [],
    },
    { predeterminados: PREDETERMINADOS },
  );

describe('venta.vaciar_orden · lo que dejó un cobro que no se completó', () => {
  it('quita las líneas de ESE borrador y ninguna más', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const salida = await vaciarOrden.ejecutar(ctx, { ordenId: CUENTA });

    expect(salida.quitadas).toBe(2);
    expect(base.filas('orden_lineas').map((f) => f['id'])).toEqual(['ajena']);
  });

  it('una venta cobrada no se vacía', async () => {
    const base = baseDe('pagada');
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const codigo = await vaciarOrden
      .ejecutar(ctx, { ordenId: CUENTA })
      .then(() => 'NO_LANZO')
      .catch((error: unknown) => (esErrorDominio(error) ? error.codigo : String(error)));

    expect(codigo).toBe('ORDEN_NO_EDITABLE');
    expect(base.filas('orden_lineas')).toHaveLength(3);
  });
});

describe('venta.cambiar_cantidad no revalúa una presentación al precio de la pieza', () => {
  it('se niega, y la línea se queda como estaba', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'));

    const codigo = await cambiarCantidad
      .ejecutar(ctx, { ordenId: CUENTA, lineaId: 'l2', cantidad: '2' })
      .then(() => 'NO_LANZO')
      .catch((error: unknown) => (esErrorDominio(error) ? error.codigo : String(error)));

    expect(codigo).toBe('ORDEN_NO_EDITABLE');
    expect(base.filas('orden_lineas').find((f) => f['id'] === 'l2')?.['cantidad']).toBe(
      linea()['cantidad'],
    );
  });
});
