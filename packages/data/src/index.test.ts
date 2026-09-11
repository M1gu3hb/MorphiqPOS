import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('el bundle de servidor no incluye el ejecutor de migraciones', () => {
  it('lo expone sólo por el subpath dedicado', () => {
    const indice = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');
    const paquete = readFileSync(
      fileURLToPath(new URL('../package.json', import.meta.url)),
      'utf8',
    );

    expect(indice).not.toContain("from './migraciones/ejecutor.ts'");
    expect(paquete).toContain('"./migraciones": "./src/migraciones/ejecutor.ts"');
  });
});
