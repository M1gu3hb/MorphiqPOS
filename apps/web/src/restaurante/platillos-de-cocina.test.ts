import { describe, expect, it } from 'vitest';

import { platillosPorPreparar, tieneQuePreparar } from './platillos-de-cocina.ts';

describe('lo que la cocina tiene que preparar', () => {
  it('UN PLATILLO ANULADO EN LA MESA NO SE PINTA: el cocinero lo haría y nadie lo pagaría', () => {
    const items = [
      { id: 'a', producto_nombre: 'Arrachera', estado: 'pendiente' },
      { id: 's', producto_nombre: 'Sopa de tortilla', estado: 'cancelado' },
    ];

    expect(platillosPorPreparar(items).map((i) => i.id)).toEqual(['a']);
  });

  it('un item sin estado —lo que pasan las pruebas de la pantalla— se prepara', () => {
    expect(platillosPorPreparar([{ id: 'a' }, { id: 'b', estado: null }])).toHaveLength(2);
  });

  it('en preparación, listo y entregado siguen siendo del tablero', () => {
    const items = ['pendiente', 'en_preparacion', 'listo', 'entregado'].map((estado) => ({
      estado,
    }));

    expect(platillosPorPreparar(items)).toHaveLength(4);
  });

  it('UNA COMANDA CON TODO ANULADO no tiene qué preparar: no se queda como tarjeta vacía', () => {
    expect(tieneQuePreparar([{ estado: 'cancelado' }, { estado: 'cancelado' }])).toBe(false);
  });

  it('con un solo platillo vivo, la comanda sigue siendo trabajo', () => {
    expect(tieneQuePreparar([{ estado: 'cancelado' }, { estado: 'pendiente' }])).toBe(true);
  });

  it('una comanda sin items es un dato a medias, y se sigue enseñando', () => {
    expect(tieneQuePreparar([])).toBe(true);
  });
});
