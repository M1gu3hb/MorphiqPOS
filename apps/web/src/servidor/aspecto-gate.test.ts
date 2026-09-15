import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SCRIPT =
  process.env['MORPHIQPOS_ASPECT_GATE_SOURCE_PATH'] ??
  resolve(process.cwd(), 'scripts/verificar-aspecto.mjs');

describe('O-3 · la puerta de aspecto siempre decide', () => {
  it('no sale antes de comparar ni requiere un modo estricto para fallar', () => {
    const fuente = readFileSync(SCRIPT, 'utf8');

    expect(fuente).not.toContain('if (cambiados.length === 0)');
    expect(fuente).not.toContain('const ESTRICTO');
    expect(fuente).toContain('if (avisos > 0) process.exit(1)');
  });
});
