import { describe, expect, it } from 'vitest';

import { cajaDelBoton, platillosDelBoton, precioDelBoton } from './botones-de-pagina.ts';

/**
 * DP-9.7 · LOS BOTONES SOBRE LA PÁGINA, del lado de la pantalla.
 *
 * En % de la imagen (iguales en cualquier teléfono y con zoom), con los platillos que el portal
 * sí tiene y el precio VIGENTE sólo si el botón lo pide y el negocio enseña precios.
 */
describe('los botones de una página', () => {
  it('se colocan en % de la imagen', () => {
    expect(cajaDelBoton({ x: 8.7, y: 37.98, ancho: 82.59, alto: 3.91 })).toEqual({
      left: '8.7%',
      top: '37.98%',
      width: '82.59%',
      height: '3.91%',
    });
  });

  it('sus platillos, en su orden, y sólo los que el portal tiene', () => {
    const productos = [{ id: 'a' }, { id: 'b' }];
    expect(platillosDelBoton({ productoIds: ['b', 'x', 'a'] }, productos)).toEqual([
      { id: 'b' },
      { id: 'a' },
    ]);
  });

  it('el precio vigente: sólo si el botón lo pide, si hay precios y si es un precio', () => {
    const taco = { precio_venta_centavos: '3500' };
    expect(precioDelBoton({ mostrarPrecio: true }, taco, true)).toBe(3500);
    expect(precioDelBoton({ mostrarPrecio: false }, taco, true)).toBeNull();
    expect(precioDelBoton({ mostrarPrecio: true }, taco, false)).toBeNull();
    expect(
      precioDelBoton({ mostrarPrecio: true }, { precio_venta_centavos: null }, true),
    ).toBeNull();
    expect(precioDelBoton({ mostrarPrecio: true }, undefined, true)).toBeNull();
  });
});
