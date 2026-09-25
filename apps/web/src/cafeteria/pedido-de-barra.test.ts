import { describe, expect, it } from 'vitest';

import {
  conBebida,
  conCantidad,
  lineasParaCobrar,
  precioConOpciones,
  totalDe,
  type BebidaParaElPedido,
} from './pedido-de-barra.ts';

const LATTE: BebidaParaElPedido = {
  productoId: 'latte',
  nombre: 'Latte 12 oz',
  precioBaseCentavos: 6500,
};
const AVENA = { id: 'o-avena', nombre: 'Avena', deltaCentavos: 1200 };
const GRANDE = { id: 'o-16', nombre: '16 oz', deltaCentavos: 800 };

describe('el pedido del mostrador de la cafetería', () => {
  it('dos lattes iguales son una línea de dos', () => {
    const pedido = conBebida(conBebida([], LATTE), LATTE);
    expect(pedido).toHaveLength(1);
    expect(pedido[0]?.cantidad).toBe(2);
  });

  it('un latte de avena y uno con entera son DOS líneas, con dos precios', () => {
    const pedido = conBebida(conBebida([], LATTE), { ...LATTE, opciones: [AVENA] });
    expect(pedido.map((l) => [l.nombre, l.precioCentavos])).toEqual([
      ['Latte 12 oz', 6500],
      ['Latte 12 oz · Avena', 7700],
    ]);
    expect(totalDe(pedido)).toBe(14_200);
  });

  it('las mismas opciones en otro orden son la misma bebida', () => {
    const pedido = conBebida(conBebida([], { ...LATTE, opciones: [AVENA, GRANDE] }), {
      ...LATTE,
      opciones: [GRANDE, AVENA],
    });
    expect(pedido).toHaveLength(1);
    expect(pedido[0]?.cantidad).toBe(2);
    expect(pedido[0]?.precioCentavos).toBe(8500);
  });

  it('una alergia distinta separa la línea: el vaso se prepara mirándola', () => {
    const pedido = conBebida(conBebida([], LATTE), { ...LATTE, alergias: ['Lácteos'] });
    expect(pedido).toHaveLength(2);
  });

  it('el precio nunca baja de cero, igual que en el servidor', () => {
    expect(precioConOpciones(200, [{ id: 'v', nombre: 'Vaso propio', deltaCentavos: -300 }])).toBe(
      0,
    );
  });

  it('quitar uno de una línea no toca la otra del mismo producto', () => {
    const pedido = conBebida(conBebida([], LATTE), { ...LATTE, opciones: [AVENA] });
    const sinLaDeAvena = conCantidad(pedido, pedido[1]?.clave ?? '', -1);
    expect(sinLaDeAvena.map((l) => l.nombre)).toEqual(['Latte 12 oz']);
  });

  it('al cobro, la bebida con opciones viaja con sus ids; la sencilla, como siempre', () => {
    const pedido = conBebida(conBebida([], LATTE), {
      ...LATTE,
      opciones: [AVENA],
      nota: ' sin espuma ',
    });
    expect(lineasParaCobrar(pedido)).toEqual([
      { productoId: 'latte', cantidad: '1' },
      {
        productoId: 'latte',
        cantidad: '1',
        opciones: ['o-avena'],
        alergias: [],
        nota: 'sin espuma',
      },
    ]);
  });
});
