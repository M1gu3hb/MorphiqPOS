import { describe, expect, it } from 'vitest';

import {
  claveDePartida,
  partidasGuardadas,
  precioPorFactor,
  sumarPartida,
  type PartidaGuardada,
} from './nota-del-mostrador.ts';

const CAJA = { id: 'caja-100', etiqueta: 'Caja (100)', precioCentavos: 30_000 };

describe('la nota del mostrador guardada en la pestaña', () => {
  it('lo que no tiene forma de partida se descarta, no revienta', () => {
    const texto = JSON.stringify([
      { productoId: 'tornillo', cantidad: 3, presentacion: null },
      { productoId: 'tuerca', cantidad: 0, presentacion: null },
      { productoId: 'broca', cantidad: 'dos', presentacion: null },
      { productoId: 'taquete', cantidad: 1, presentacion: { id: 'x' } },
      { productoId: 'tornillo', cantidad: 1, presentacion: CAJA },
      'basura',
    ]);
    expect(partidasGuardadas(texto)).toEqual([
      { productoId: 'tornillo', cantidad: 3, presentacion: null },
      { productoId: 'tornillo', cantidad: 1, presentacion: CAJA },
    ]);
    expect(partidasGuardadas('{no es json')).toEqual([]);
    expect(partidasGuardadas(null)).toEqual([]);
  });

  it('la misma pieza en caja y suelta son dos renglones; en la misma forma se juntan', () => {
    const suelta: PartidaGuardada = { productoId: 'tornillo', cantidad: 3, presentacion: null };
    const caja: PartidaGuardada = { productoId: 'tornillo', cantidad: 1, presentacion: CAJA };
    const juntas = sumarPartida(sumarPartida([suelta], caja), { ...suelta, cantidad: 2 });
    expect(juntas.map((p) => [claveDePartida(p.productoId, p.presentacion), p.cantidad])).toEqual([
      ['tornillo:base', 5],
      ['tornillo:caja-100', 1],
    ]);
  });

  it('el precio por factor, al centavo y sin flotantes', () => {
    expect(precioPorFactor(350, 100)).toBe(35_000);
    expect(precioPorFactor(333, 0.5)).toBe(167);
    expect(precioPorFactor(19_500, 0.25)).toBe(4_875);
  });
});
