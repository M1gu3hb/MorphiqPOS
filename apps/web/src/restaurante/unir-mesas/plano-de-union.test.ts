import { describe, expect, it } from 'vitest';

import {
  escalaDelPlano,
  juntarAlGrupo,
  mesasEnPlano,
  nombreConUnidas,
  sinAbsorbidas,
  type MesaDelPlanoDeUnion,
} from './plano-de-union';

const mesa = (
  id: string,
  numero: number,
  x: number,
  y: number,
  extra: Partial<MesaDelPlanoDeUnion> = {},
): MesaDelPlanoDeUnion => ({
  id,
  numero,
  posicion_x: x,
  posicion_y: y,
  forma: 'redonda',
  tamano: 'mediana',
  unida_a_mesa_id: null,
  ...extra,
});

describe('el plano de la unión', () => {
  it('cada mesa con su caja del mapa (posición y medidas)', () => {
    expect(mesasEnPlano([mesa('a', 1, 10, 20, { forma: 'rectangular' })])).toEqual([
      { id: 'a', x: 10, y: 20, ancho: 120, alto: 70 },
    ]);
  });

  it('las absorbidas no se pintan; la principal lleva sus números', () => {
    const mesas = [
      mesa('p', 4, 0, 0),
      mesa('a', 5, 0, 0, { unida_a_mesa_id: 'p' }),
      mesa('b', 2, 0, 0, { unida_a_mesa_id: 'p' }),
      mesa('x', 7, 0, 0),
    ];
    expect(sinAbsorbidas(mesas).map((m) => m.numero)).toEqual([4, 7]);
    expect(nombreConUnidas(mesas[0]!, mesas)).toBe('Unida con 2 · 5');
    expect(nombreConUnidas(mesas[3]!, mesas)).toBeNull();
  });

  it('con un toque, la mesa va junto al grupo sin encimarse con nadie', () => {
    const plano = mesasEnPlano([
      mesa('a', 1, 100, 100),
      mesa('b', 2, 600, 300),
      mesa('c', 3, 180, 100),
    ]);
    // «c» ya está pegada a «a»: «b» va a la derecha de «c».
    const b = juntarAlGrupo('b', ['a', 'c'], plano);
    expect(b).toEqual({ x: 260, y: 100 });
  });

  it('si a la derecha no cabe (otra mesa estorba), va abajo', () => {
    const plano = mesasEnPlano([
      mesa('a', 1, 100, 100),
      mesa('estorbo', 9, 180, 100),
      mesa('b', 2, 600, 300),
    ]);
    expect(juntarAlGrupo('b', ['a'], plano)).toEqual({ x: 100, y: 180 });
  });

  it('el plano se encoge para caber en pantallas angostas, nunca se agranda', () => {
    // Hasta 904 + 80 de la mesa + 16 de margen: 1000.
    const plano = mesasEnPlano([mesa('a', 1, 0, 0), mesa('b', 2, 904, 0)]);
    expect(escalaDelPlano(500, plano)).toBeCloseTo(0.5);
    expect(escalaDelPlano(2000, plano)).toBe(1);
  });
});
