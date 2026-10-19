import { describe, expect, it } from 'vitest';

import { puntosBaseDe } from './tasa-de-terminal.ts';

describe('la tasa de la terminal, tecleada', () => {
  it('«3.6» son 360 puntos base, «3,5» también se entiende', () => {
    expect(puntosBaseDe('3.6')).toBe(360);
    expect(puntosBaseDe('3,5')).toBe(350);
    expect(puntosBaseDe('4')).toBe(400);
    expect(puntosBaseDe('2.75')).toBe(275);
  });

  it('lo que no es una tasa de terminal no se guarda', () => {
    // 36 donde iba 3.6 cobraría diez veces la comisión en cada corte.
    expect(puntosBaseDe('36')).toBeNull();
    expect(puntosBaseDe('3.625')).toBeNull();
    expect(puntosBaseDe('')).toBeNull();
    expect(puntosBaseDe('tres')).toBeNull();
  });
});
