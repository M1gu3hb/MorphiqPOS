import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { debeLimpiarVencidos } from './limite.ts';

const FUENTE =
  process.env['MORPHIQPOS_RATE_LIMIT_REPOSITORY_PATH'] ??
  fileURLToPath(new URL('./limite.ts', import.meta.url));

describe('C-14 · retención del límite de tasa', () => {
  it('selecciona aproximadamente una de cada 512 operaciones', () => {
    expect(debeLimpiarVencidos(0)).toBe(true);
    expect(debeLimpiarVencidos(1 / 512 - Number.EPSILON)).toBe(true);
    expect(debeLimpiarVencidos(1 / 512)).toBe(false);
    expect(debeLimpiarVencidos(1)).toBe(false);
  });

  it('invoca la purga desde el camino real del contador', () => {
    const fuente = readFileSync(FUENTE, 'utf8');
    expect(fuente).toContain('if (debeLimpiarVencidos(Math.random()))');
    expect(fuente).toContain('valorAleatorio < 1 / FRECUENCIA_LIMPIEZA');
    expect(fuente).toContain('await limpiarVencidos(RETENCION_BASE_SEGUNDOS)');
    expect(fuente).toContain('await limpiarSiCorresponde();');
  });
});
