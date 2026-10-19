import { describe, expect, it } from 'vitest';

import { EN_INGLES, traducir } from './vocabulario-de-color.mjs';

/**
 * El patrón de `verify:primitivas` que caza utilidades de color en inglés (C.17 de la 2.4).
 *
 * Tres primitivas llevaban `*:[svg]:text-destructive!` y la puerta no las veía: su
 * expresión no admitía el `!` de «importante» al final. Una puerta que se salta la
 * sintaxis que Tailwind acepta no protege ese caso.
 */
function cazadas(texto: string): string[] {
  return [...texto.matchAll(new RegExp(EN_INGLES.source, 'g'))].map((m) => m[0]);
}

describe('EN_INGLES', () => {
  it('caza la utilidad en inglés con el importante al FINAL (Tailwind 4)', () => {
    expect(cazadas('data-[variant=destructive]:*:[svg]:text-destructive!')).toEqual([
      'text-destructive',
    ]);
  });

  it('y con el importante al PRINCIPIO (la forma de Tailwind 3)', () => {
    expect(cazadas('hover:!bg-muted')).toEqual(['bg-muted']);
  });

  it('sigue cazando las formas de siempre', () => {
    expect(cazadas('bg-card text-muted-foreground/70 border-input')).toEqual([
      'bg-card',
      'text-muted-foreground',
      'border-input',
    ]);
  });

  it('no caza un token del sistema ni un nombre que sólo empieza igual', () => {
    expect(cazadas('bg-superficie text-peligro text-destructiva-x')).toEqual([]);
  });

  it('traduce conservando el importante', () => {
    expect(traducir('*:[svg]:text-destructive!')).toBe('*:[svg]:text-peligro!');
  });
});
