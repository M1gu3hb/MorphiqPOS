import { describe, expect, it } from 'vitest';

import { rotuloDeLaCuenta } from './cuenta-de-la-caja.ts';

const PALABRAS = { mesa: 'Mesa', sinMesa: 'Sin mesa' } as const;

describe('el nombre de una cuenta en la caja', () => {
  it('una cuenta de mesa se llama como su mesa', () => {
    expect(rotuloDeLaCuenta({ mesa_numero: 5, cliente_nombre: null }, PALABRAS)).toBe('Mesa 5');
  });

  it('la mesa manda sobre el nombre del cliente: el cajero busca por mesa', () => {
    expect(rotuloDeLaCuenta({ mesa_numero: 5, cliente_nombre: 'Familia López' }, PALABRAS)).toBe(
      'Mesa 5',
    );
  });

  it('UNA PARTE DE UNA CUENTA DIVIDIDA no tiene mesa y se llama como dice su nombre', () => {
    expect(
      rotuloDeLaCuenta({ mesa_numero: null, cliente_nombre: 'Mesa 5 · cuenta 1 de 2' }, PALABRAS),
    ).toBe('Mesa 5 · cuenta 1 de 2');
  });

  it('sin mesa y sin nombre, dice de dónde no viene', () => {
    expect(rotuloDeLaCuenta({ mesa_numero: null, cliente_nombre: null }, PALABRAS)).toBe(
      'Sin mesa',
    );
    expect(rotuloDeLaCuenta({ mesa_numero: null, cliente_nombre: '   ' }, PALABRAS)).toBe(
      'Sin mesa',
    );
  });
});
