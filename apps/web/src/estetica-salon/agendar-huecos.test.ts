import { describe, expect, it } from 'vitest';

import {
  conOtraPersona,
  consumoDeLaReceta,
  diaIso,
  huecosParaOfrecer,
  minutosDelServicio,
} from './agendar-huecos.ts';

describe('cuánto dura el servicio con quien lo da', () => {
  it('los tres tramos, al factor de esa persona', () => {
    const tinte = { duracion_activa_1_min: 30, duracion_pasiva_min: 35, duracion_activa_2_min: 40 };
    expect(minutosDelServicio(tinte)).toBe(105);
    expect(minutosDelServicio(tinte, 8_000)).toBe(84);
  });

  it('sin tramos, lo estimado; sin nada, una hora', () => {
    expect(minutosDelServicio({ tiempo_preparacion_estimado: 45 })).toBe(45);
    expect(minutosDelServicio({})).toBe(60);
  });

  it('nunca menos de 5 ni más de 600, lo que el servidor acepta', () => {
    expect(minutosDelServicio({ duracion_activa_1_min: 2 })).toBe(5);
    expect(minutosDelServicio({ duracion_activa_1_min: 500 }, 20_000)).toBe(600);
  });
});

describe('los huecos que se ofrecen', () => {
  const h = (profesionalId: string, inicio: string) => ({ profesionalId, inicio });

  it('en orden, a lo más dos por día y seis en total', () => {
    const ofrecidos = huecosParaOfrecer([
      h('k', '2026-09-26T16:00:00'),
      h('k', '2026-09-26T10:00:00'),
      h('k', '2026-09-26T12:00:00'),
      h('k', '2026-09-27T10:00:00'),
    ]);
    expect(ofrecidos.map((o) => o.inicio.getHours())).toEqual([10, 12, 10]);
  });

  it('con otra persona: el primero de cada una que LO DA, dos a lo más', () => {
    const otros = conOtraPersona(
      [
        h('k', '2026-09-26T09:00:00'),
        h('d', '2026-09-26T11:00:00'),
        h('d', '2026-09-26T10:00:00'),
        h('s', '2026-09-26T08:00:00'),
        h('p', '2026-09-26T12:00:00'),
      ],
      'k',
      new Set(['d', 'p']),
    );
    expect(otros.map((o) => [o.profesionalId, o.inicio.getHours()])).toEqual([
      ['d', 10],
      ['p', 12],
    ]);
  });
});

describe('lo que el servicio gasta de la cabina', () => {
  it('sumado por insumo, con cuatro decimales; sin cantidad no suma', () => {
    expect(
      consumoDeLaReceta([
        { ingrediente_id: 'tinte', cantidad_convertida_unidad_base: 60 },
        { ingrediente_id: 'oxidante', cantidad_convertida_unidad_base: 90 },
        { ingrediente_id: 'tinte', cantidad_convertida_unidad_base: 0.5 },
        { ingrediente_id: 'guantes', cantidad_convertida_unidad_base: null },
      ]),
    ).toEqual([
      { insumoId: 'tinte', cantidadBase: '60.5000' },
      { insumoId: 'oxidante', cantidadBase: '90.0000' },
    ]);
  });

  it('el día va en la hora local', () => {
    expect(diaIso(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});
