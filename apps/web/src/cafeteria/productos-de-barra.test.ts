import { describe, expect, it } from 'vitest';

import { gruposPorProducto, ivaEnPalabras } from './productos-de-barra.ts';

describe('los dos campos que la cafetería tiene y el restaurante no (C.10 de la 2.4)', () => {
  it('los grupos de opciones de cada bebida, sin repetir y en el orden del menú', () => {
    const grupos = gruposPorProducto([
      { producto_id: 'latte', grupo: 'Tamaño' },
      { producto_id: 'latte', grupo: 'Tamaño' },
      { producto_id: 'latte', grupo: 'Leche' },
      { producto_id: 'americano', grupo: 'Tamaño' },
      { producto_id: 'galleta', grupo: null },
    ]);
    expect(grupos.get('latte')).toEqual(['Tamaño', 'Leche']);
    expect(grupos.get('americano')).toEqual(['Tamaño']);
    expect(grupos.has('galleta')).toBe(false);
  });

  it('la tasa de impuesto como se lee: el grano al 0 % también se dice', () => {
    expect(ivaEnPalabras(1600)).toBe('IVA 16 %');
    expect(ivaEnPalabras(0)).toBe('IVA 0 %');
    expect(ivaEnPalabras(null)).toBeNull();
  });
});
