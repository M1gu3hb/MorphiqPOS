import { describe, expect, it } from 'vitest';

import { aDiezmilesimas, porCantidad } from './escala.ts';

/**
 * Pruebas de la escala de cantidades.
 *
 * Este módulo nació de un error propio: `costo * Math.trunc(Number(cantidad))`
 * daba **cero** para media res. Las dos primeras pruebas son exactamente esa
 * regresión.
 */

describe('aDiezmilesimas', () => {
  it('convierte enteros y decimales a la escala de numeric(14,4)', () => {
    expect(aDiezmilesimas('1')).toBe(10_000n);
    expect(aDiezmilesimas('0.5')).toBe(5_000n);
    expect(aDiezmilesimas('2.25')).toBe(22_500n);
    expect(aDiezmilesimas('0.0001')).toBe(1n);
  });

  it('trunca más allá de la cuarta cifra, que es lo que guarda la columna', () => {
    expect(aDiezmilesimas('0.00019')).toBe(1n);
  });

  it('acepta cantidades grandes sin perder precisión', () => {
    expect(aDiezmilesimas('12345678.9999')).toBe(123_456_789_999n);
  });
});

describe('porCantidad', () => {
  it('no devuelve cero para media unidad (la regresión que originó el módulo)', () => {
    expect(porCantidad(20_000n, '0.5')).toBe(10_000n);
  });

  it('cobra proporcional en cantidades por debajo de la unidad', () => {
    expect(porCantidad(100n, '0.25')).toBe(25n);
    expect(porCantidad(9_950n, '0.125')).toBe(1_244n); // 1243.75 → 1244
  });

  it('redondea el medio centavo hacia arriba', () => {
    expect(porCantidad(1n, '0.5')).toBe(1n); // 0.5 → 1
    expect(porCantidad(1n, '0.4999')).toBe(0n); // 0.4999 → 0
  });

  it('multiplica enteros sin tocar el valor', () => {
    expect(porCantidad(1_599n, '3')).toBe(4_797n);
  });

  it('no acumula el error de 0.1 + 0.2', () => {
    // Con float, sumar 0.1 diez veces da 0.9999999999999999.
    let suma = 0n;
    for (let i = 0; i < 10; i += 1) suma += porCantidad(10_000n, '0.1');
    expect(suma).toBe(10_000n);
  });

  it('conserva el signo en devoluciones', () => {
    expect(porCantidad(1_000n, '-1.5')).toBe(-1_500n);
  });
});
