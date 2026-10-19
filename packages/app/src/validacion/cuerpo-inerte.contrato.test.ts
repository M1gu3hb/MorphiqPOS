import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { comandosRegistrados } from '../pruebas/comandos-registrados.ts';
import { CUERPO_INERTE } from '../pruebas/cuerpo-inerte.ts';

const ESPEC_DE_LA_MATRIZ = fileURLToPath(
  new URL('../../../../pruebas/e2e/matriz-de-permisos.spec.ts', import.meta.url),
);

describe('la matriz de permisos pregunta sin ejecutar', () => {
  it('ningún comando del registro acepta el cuerpo inerte', async () => {
    const comandos = await comandosRegistrados();
    expect(comandos.size).toBeGreaterThan(200);
    const loAceptan = [...comandos.values()]
      .filter((c) => c.entrada.safeParse(CUERPO_INERTE).success)
      .map((c) => c.nombre);
    expect(loAceptan).toEqual([]);
  }, 60_000);

  it('la matriz manda el cuerpo inerte, no un objeto vacío', () => {
    const espec = readFileSync(ESPEC_DE_LA_MATRIZ, 'utf8');
    expect(espec).toContain('data: JSON.stringify(CUERPO_INERTE)');
    expect(espec).not.toMatch(/data:\s*\{\s*\}/);
  });
});
