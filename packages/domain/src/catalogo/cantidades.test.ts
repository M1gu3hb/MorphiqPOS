import { ErrorDominio } from '@morphiqpos/contracts/errores';
import { describe, expect, it } from 'vitest';

import { cantidad, cantidadATexto, convertirUnidad, normalizarUnidad } from './index.ts';

describe('CAT-02 · cantidades exactas y unidades', () => {
  it.each(['0', '0.0001', '1.2345', '9999999999.9999'])('conserva %s', (texto) => {
    expect(cantidadATexto(cantidad(texto))).toBe(texto);
  });

  it('normaliza ceros y espacios sin usar punto flotante', () => {
    expect(cantidad(' 001.2300 ')).toBe(12300n);
    expect(cantidadATexto(cantidad('001.2300'))).toBe('1.23');
  });

  it.each(['', '-1', 'NaN', 'Infinity', '1e3', '1,5', '1.00001', '10000000000'])(
    'rechaza cantidad inválida %s',
    (texto) => {
      expect(() => cantidad(texto)).toThrow(ErrorDominio);
    },
  );

  it.each([
    [' KILÓGRAMOS ', 'kg'],
    ['gr', 'g'],
    ['LTS', 'l'],
    ['mililitros', 'ml'],
    ['PZAS', 'pieza'],
    ['unidades', 'pieza'],
    ['metros', 'm'],
    ['caja', 'caja'],
  ])('normaliza %s a %s', (entrada, esperado) => {
    expect(normalizarUnidad(entrada)).toBe(esperado);
  });

  it('rechaza unidades desconocidas', () => {
    expect(() => normalizarUnidad('cubeta')).toThrow(ErrorDominio);
  });

  it.each([
    ['1.2345', 'kg', 'g', '1234.5'],
    ['250', 'g', 'kg', '0.25'],
    ['0.125', 'l', 'ml', '125'],
    ['125', 'ml', 'l', '0.125'],
    ['3.25', 'm', 'm', '3.25'],
    ['2', 'caja', 'caja', '2'],
  ])('convierte %s %s a %s', (texto, origen, destino, esperado) => {
    expect(cantidadATexto(convertirUnidad(cantidad(texto), origen, destino))).toBe(esperado);
  });

  it.each([
    ['kg', 'l'],
    ['m', 'pieza'],
    ['caja', 'pieza'],
    ['paquete', 'caja'],
  ])('no inventa equivalencia de %s a %s', (origen, destino) => {
    expect(() => convertirUnidad(cantidad('1'), origen, destino)).toThrow(ErrorDominio);
  });

  it('rechaza pérdida de precisión y desbordamiento al convertir', () => {
    expect(() => convertirUnidad(cantidad('0.0001'), 'g', 'kg')).toThrow(ErrorDominio);
    expect(() => convertirUnidad(cantidad('9999999999'), 'kg', 'g')).toThrow(ErrorDominio);
  });
});
