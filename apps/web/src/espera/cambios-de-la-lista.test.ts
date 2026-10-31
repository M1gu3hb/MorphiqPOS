import { describe, expect, it } from 'vitest';

import { cambiosDeLaLista } from './cambios-de-la-lista';

/**
 * DP-11.2 · QUÉ DESPIERTA A LA CAJA: una cuenta que aparece en «pedidas» (la pidió el mesero o el
 * comensal) o una que se va (la cobró otra terminal). La PRIMERA lectura no despierta a nadie:
 * es lo que ya estaba.
 */
describe('cambiosDeLaLista', () => {
  it('la primera lectura sólo deja la referencia', () => {
    const r = cambiosDeLaLista(null, ['a', 'b']);
    expect(r.nuevas).toEqual([]);
    expect(r.idas).toEqual([]);
    expect([...r.vistas]).toEqual(['a', 'b']);
  });

  it('dice qué llegó y qué se fue entre dos lecturas', () => {
    const r = cambiosDeLaLista(new Set(['a', 'b']), ['b', 'c']);
    expect(r.nuevas).toEqual(['c']);
    expect(r.idas).toEqual(['a']);
    expect([...r.vistas].sort()).toEqual(['b', 'c']);
  });

  it('la misma lista no cambia nada', () => {
    const r = cambiosDeLaLista(new Set(['a']), ['a']);
    expect(r).toMatchObject({ nuevas: [], idas: [] });
  });
});
