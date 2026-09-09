import { describe, expect, it } from 'vitest';

import { centavos } from '../dinero/centavos.ts';
import { calcularTotales, type LineaValorada, type ReglaImpuesto } from './totales.ts';

/**
 * Totales de una orden.
 *
 * Aquí se pierde dinero, así que además de las pruebas hay mutaciones
 * (`pnpm verify:venta`). Los casos son los que rompen: impuesto incluido contra
 * añadido, descuento mayor que la venta, importes impares que obligan a
 * redondear, y la orden vacía.
 */

const IVA_INCLUIDO: ReglaImpuesto = { tasaPuntosBase: 1600, incluidoEnPrecio: true };
const IVA_AÑADIDO: ReglaImpuesto = { tasaPuntosBase: 1600, incluidoEnPrecio: false };
const SIN_IMPUESTO: ReglaImpuesto = { tasaPuntosBase: 0, incluidoEnPrecio: true };

function linea(subtotal: number, extra: Partial<LineaValorada> = {}): LineaValorada {
  return { subtotalCentavos: centavos(subtotal), ...extra };
}

describe('calcularTotales · suma de líneas', () => {
  it('una orden vacía da todo en cero, no NaN ni error', () => {
    const totales = calcularTotales([], IVA_INCLUIDO);
    expect(totales.subtotalCentavos).toBe(0n);
    expect(totales.totalCentavos).toBe(0n);
    expect(totales.impuestosCentavos).toBe(0n);
    expect(totales.margenBp).toBe(0);
  });

  it('suma los subtotales de las líneas', () => {
    const totales = calcularTotales([linea(18900), linea(4550), linea(1200)], SIN_IMPUESTO);
    expect(totales.subtotalCentavos).toBe(24650n);
    expect(totales.totalCentavos).toBe(24650n);
  });
});

describe('calcularTotales · impuesto', () => {
  it('IVA incluido: se EXTRAE del total, no lo engorda', () => {
    // 116.00 con IVA incluido al 16 % son 100.00 de base y 16.00 de impuesto.
    const totales = calcularTotales([linea(11600)], IVA_INCLUIDO);
    expect(totales.totalCentavos).toBe(11600n);
    expect(totales.impuestosCentavos).toBe(1600n);
  });

  it('IVA añadido: se SUMA encima del total', () => {
    const totales = calcularTotales([linea(10000)], IVA_AÑADIDO);
    expect(totales.impuestosCentavos).toBe(1600n);
    expect(totales.totalCentavos).toBe(11600n);
  });

  it('un importe impar redondea al centavo, sin arrastrar decimales', () => {
    // 99.99 con IVA incluido: 999900/11600 → 1379.17…, redondea a 1379.
    const totales = calcularTotales([linea(9999)], IVA_INCLUIDO);
    expect(totales.impuestosCentavos).toBe(1379n);
    // Lo que no puede pasar: que el total cambie por calcular el impuesto.
    expect(totales.totalCentavos).toBe(9999n);
  });

  it('sin impuesto configurado, el impuesto es cero y el total no se mueve', () => {
    const totales = calcularTotales([linea(5000)], SIN_IMPUESTO);
    expect(totales.impuestosCentavos).toBe(0n);
    expect(totales.totalCentavos).toBe(5000n);
  });

  it('rechaza una tasa que no es un entero de puntos base', () => {
    expect(() =>
      calcularTotales([linea(100)], { tasaPuntosBase: 0.16, incluidoEnPrecio: true }),
    ).toThrow(/puntos base/i);
    expect(() =>
      calcularTotales([linea(100)], { tasaPuntosBase: -1, incluidoEnPrecio: true }),
    ).toThrow(/puntos base/i);
  });
});

describe('calcularTotales · descuento', () => {
  it('resta el descuento del subtotal', () => {
    const totales = calcularTotales(
      [linea(10000, { descuentoCentavos: centavos(1500) })],
      SIN_IMPUESTO,
    );
    expect(totales.descuentoCentavos).toBe(1500n);
    expect(totales.totalCentavos).toBe(8500n);
  });

  it('un descuento mayor que la venta se agota en ella: el total NUNCA es negativo', () => {
    // Sin el tope, el total negativo entraría a caja como una ENTRADA de dinero
    // y el arqueo saldría descuadrado por el doble del error.
    const totales = calcularTotales(
      [linea(5000, { descuentoCentavos: centavos(9999) })],
      SIN_IMPUESTO,
    );
    expect(totales.totalCentavos).toBe(0n);
    expect(totales.descuentoCentavos).toBe(5000n);
  });
});

describe('calcularTotales · utilidad y margen', () => {
  it('utilidad = total − costo', () => {
    const totales = calcularTotales(
      [linea(10000, { costoCentavos: centavos(6000) })],
      SIN_IMPUESTO,
    );
    expect(totales.utilidadCentavos).toBe(4000n);
    expect(totales.margenBp).toBe(4000); // 40 %
  });

  it('un producto vendido bajo costo da utilidad y margen negativos, no cero', () => {
    // Esconderlo en cero es como se descubre tarde que un producto se vende con
    // pérdida: el reporte diría margen 0 % y nadie lo miraría dos veces.
    const totales = calcularTotales([linea(5000, { costoCentavos: centavos(8000) })], SIN_IMPUESTO);
    expect(totales.utilidadCentavos).toBe(-3000n);
    expect(totales.margenBp).toBe(-6000);
  });

  it('con total cero el margen es cero, sin dividir entre cero', () => {
    const totales = calcularTotales([linea(0, { costoCentavos: centavos(100) })], SIN_IMPUESTO);
    expect(totales.margenBp).toBe(0);
  });
});

describe('calcularTotales · todo junto', () => {
  it('una venta real: tres líneas, descuento, IVA incluido y costo', () => {
    const totales = calcularTotales(
      [
        linea(18900, { costoCentavos: centavos(11000) }),
        linea(4550, { costoCentavos: centavos(2800) }),
        linea(1200, { descuentoCentavos: centavos(200), costoCentavos: centavos(700) }),
      ],
      IVA_INCLUIDO,
    );

    expect(totales.subtotalCentavos).toBe(24650n);
    expect(totales.descuentoCentavos).toBe(200n);
    expect(totales.totalCentavos).toBe(24450n);
    expect(totales.costoTotalCentavos).toBe(14500n);
    expect(totales.utilidadCentavos).toBe(9950n);
    // El impuesto sale del total ya descontado, no del subtotal.
    expect(totales.impuestosCentavos).toBe(3372n);
  });
});
