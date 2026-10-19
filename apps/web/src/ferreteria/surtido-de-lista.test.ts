import { describe, expect, it } from 'vitest';

import {
  aDiezmilesimas,
  capturaInicial,
  deDiezmilesimas,
  faltante,
  pedidoDeSurtido,
  type RenglonDeLista,
} from './surtido-de-lista.ts';

const LISTA = '11500000-0000-4000-8000-000000000001';
const VARILLA = 'b0000000-0000-4000-8000-000000000010';
const CEMENTO = 'b0000000-0000-4000-8000-000000000011';

const varilla: RenglonDeLista = {
  renglonId: 'r1',
  textoPedido: 'diez de varilla del tres',
  productoId: VARILLA,
  productoNombre: 'Varilla 3/8',
  unidad: 'pieza',
  cantidad: '10.0000',
  surtida: '4.0000',
  sinExistencia: false,
};

const cemento: RenglonDeLista = {
  renglonId: 'r2',
  textoPedido: 'cemento del gris',
  productoId: null,
  productoNombre: null,
  unidad: null,
  cantidad: null,
  surtida: '0.0000',
  sinExistencia: false,
};

describe('el surtido de una lista', () => {
  it('las cantidades con coma o punto, a diezmilésimas y de vuelta', () => {
    expect(aDiezmilesimas('1,5')).toBe(15_000n);
    expect(aDiezmilesimas('2')).toBe(20_000n);
    expect(aDiezmilesimas('dos')).toBeNull();
    expect(deDiezmilesimas(15_000n)).toBe('1.5');
    expect(deDiezmilesimas(20_000n)).toBe('2');
  });

  it('lo traducido propone entregar LO QUE FALTA; lo que es texto empieza vacío', () => {
    expect(faltante(varilla)).toBe('6');
    expect(capturaInicial(varilla).ahora).toBe('6');
    expect(capturaInicial(cemento).ahora).toBe('');
    expect(faltante(cemento)).toBeNull();
  });

  it('manda lo que se entrega y lo que se traduce, y nada de lo que no se tocó', () => {
    const pedido = pedidoDeSurtido(LISTA, [varilla, cemento], {
      r2: { productoId: CEMENTO, productoNombre: 'Cemento', pedida: '5', ahora: '2', noHay: false },
    });

    expect(pedido.problemas).toEqual([]);
    expect(pedido.cuerpo.renglones).toEqual([
      {
        renglonId: 'r1',
        productoId: VARILLA,
        cantidad: '6',
        cantidadPedida: null,
        sinExistencia: false,
      },
      {
        renglonId: 'r2',
        productoId: CEMENTO,
        cantidad: '2',
        cantidadPedida: '5',
        sinExistencia: false,
      },
    ]);
  });

  it('no deja mandar más de lo que pidió, ni entregar algo sin decir qué es', () => {
    const pedido = pedidoDeSurtido(LISTA, [varilla, cemento], {
      r1: {
        productoId: VARILLA,
        productoNombre: 'Varilla',
        pedida: '10',
        ahora: '7',
        noHay: false,
      },
      r2: { productoId: null, productoNombre: null, pedida: '', ahora: '1', noHay: false },
    });

    expect(pedido.problemas).toHaveLength(2);
    expect(pedido.problemas[0]).toContain('pidió 10');
    expect(pedido.problemas[1]).toContain('elige qué producto');
  });

  it('lo que no hay viaja como faltante, sin cantidad', () => {
    const pedido = pedidoDeSurtido(LISTA, [varilla], {
      r1: { productoId: VARILLA, productoNombre: 'Varilla', pedida: '10', ahora: '', noHay: true },
    });

    expect(pedido.cuerpo.renglones).toEqual([
      {
        renglonId: 'r1',
        productoId: VARILLA,
        cantidad: null,
        cantidadPedida: null,
        sinExistencia: true,
      },
    ]);
  });

  it('sin nada que entregar ni marcar, no se manda', () => {
    const pedido = pedidoDeSurtido(LISTA, [cemento], {});
    expect(pedido.problemas).toEqual(['No hay nada que entregar ni que marcar como faltante.']);
  });
});
