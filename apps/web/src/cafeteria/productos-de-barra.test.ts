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
    // Leche antes que Tamaño aunque Tamaño llegara primero: las filas del puente no
    // vienen en el orden del menú (ver `compararGrupos`).
    expect(grupos.get('latte')).toEqual(['Leche', 'Tamaño']);
    expect(grupos.get('americano')).toEqual(['Tamaño']);
    expect(grupos.has('galleta')).toBe(false);
  });

  it('el orden de los grupos no depende del orden de las filas', () => {
    const filas = [
      { producto_id: 'capuchino', grupo: 'Extras' },
      { producto_id: 'capuchino', grupo: 'Temperatura' },
      { producto_id: 'capuchino', grupo: 'Jarabes' },
      { producto_id: 'capuchino', grupo: 'Tamaño' },
      { producto_id: 'capuchino', grupo: 'Leche' },
    ];
    const esperado = ['Leche', 'Tamaño', 'Temperatura', 'Extras', 'Jarabes'];
    expect(gruposPorProducto(filas).get('capuchino')).toEqual(esperado);
    expect(gruposPorProducto([...filas].reverse()).get('capuchino')).toEqual(esperado);
  });

  it('la tasa de impuesto como se lee: el grano al 0 % también se dice', () => {
    expect(ivaEnPalabras(1600)).toBe('IVA 16 %');
    expect(ivaEnPalabras(0)).toBe('IVA 0 %');
    expect(ivaEnPalabras(null)).toBeNull();
  });
});
