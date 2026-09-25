import { describe, expect, it } from 'vitest';

import { calcular } from './consultar.ts';

/**
 * C.9 de la 2.4 · la existencia que el cobro necesita para decir «Agotado».
 *
 * Por el insumo base si lo hay; si no, por el insumo propio SÓLO si existe —la vista del
 * mostrador da cero a un producto sin insumo, y ese cero apagaría un latte—; si no, nula.
 */
describe('existenciaDelProducto', () => {
  it('manda la existencia del insumo base', () => {
    expect(
      calcular('existenciaDelProducto', {
        existencia_base: '12.5',
        existencia_en_mostrador: '0',
        insumo_propio_id: null,
      }),
    ).toBe(12.5);
  });

  it('sin insumo base, la del insumo propio, aunque sea cero', () => {
    expect(
      calcular('existenciaDelProducto', {
        existencia_base: null,
        existencia_en_mostrador: '0',
        insumo_propio_id: 'i-1',
      }),
    ).toBe(0);
  });

  it('sin ningún insumo —un producto de receta— es nula, no cero', () => {
    expect(
      calcular('existenciaDelProducto', {
        existencia_base: null,
        existencia_en_mostrador: '0',
        insumo_propio_id: null,
      }),
    ).toBeNull();
  });
});
