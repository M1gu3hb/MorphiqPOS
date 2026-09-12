import { repoLimite } from '@morphiqpos/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LIMITES, permitir } from './limite.ts';

const FUENTE =
  process.env['MORPHIQPOS_RATE_LIMIT_SOURCE_PATH'] ??
  fileURLToPath(new URL('./limite.ts', import.meta.url));

vi.mock('@morphiqpos/data', async () => {
  const original = await vi.importActual<typeof import('@morphiqpos/data')>('@morphiqpos/data');
  return { ...original, repoLimite: { contarIntento: vi.fn() } };
});

describe('S-8/S-9 · cuotas anónimas independientes y cerradas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('declara un cubo de empleados distinto al del PIN', () => {
    expect(LIMITES).toHaveProperty('empleados');
    expect(LIMITES.empleados).not.toBe(LIMITES.entrar);
  });

  it('sin IP consume un cubo global por endpoint', async () => {
    vi.mocked(repoLimite.contarIntento).mockResolvedValueOnce({
      intentos: 1,
      esperaSegundos: 300,
    });

    const resultado = await permitir('entrar', new Headers(), 'p'.repeat(32));

    expect(resultado.ok).toBe(true);
    expect(repoLimite.contarIntento).toHaveBeenCalledTimes(1);
    expect(repoLimite.contarIntento).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      300,
    );
    expect(readFileSync(FUENTE, 'utf8')).toContain("origenDe(cabeceras) ?? 'origen_global'");
  });

  it('el cubo global se agota igual que uno identificado', async () => {
    vi.mocked(repoLimite.contarIntento).mockResolvedValueOnce({
      intentos: LIMITES.entrar.intentos + 1,
      esperaSegundos: 120,
    });

    await expect(permitir('entrar', new Headers(), 'p'.repeat(32))).resolves.toEqual({
      ok: false,
      esperaSegundos: 120,
    });
  });
});
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
