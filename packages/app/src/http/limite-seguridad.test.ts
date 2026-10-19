import { repoLimite } from '@morphiqpos/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { devolver, LIMITES, permitir } from './limite.ts';

const FUENTE =
  process.env['MORPHIQPOS_RATE_LIMIT_SOURCE_PATH'] ??
  fileURLToPath(new URL('./limite.ts', import.meta.url));

vi.mock('@morphiqpos/data', async () => {
  const original = await vi.importActual<typeof import('@morphiqpos/data')>('@morphiqpos/data');
  return { ...original, repoLimite: { contarIntento: vi.fn(), devolverIntento: vi.fn() } };
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

describe('la entrada correcta devuelve su intento al MISMO cubo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve con la clave con la que contó, y no con la de otra red', async () => {
    vi.mocked(repoLimite.contarIntento).mockResolvedValue({ intentos: 1, esperaSegundos: 300 });
    const deLaCaja = new Headers({ 'x-vercel-forwarded-for': '203.0.113.7' });
    const deOtraRed = new Headers({ 'x-vercel-forwarded-for': '198.51.100.20' });

    await permitir('entrar', deLaCaja, 'p'.repeat(32));
    await devolver('entrar', deLaCaja, 'p'.repeat(32));
    await devolver('entrar', deOtraRed, 'p'.repeat(32));

    const contada = vi.mocked(repoLimite.contarIntento).mock.calls[0]?.[0];
    const devueltas = vi.mocked(repoLimite.devolverIntento).mock.calls.map(([clave]) => clave);
    expect(contada).toMatch(/^[a-f0-9]{64}$/);
    expect(devueltas[0]).toBe(contada);
    expect(devueltas[1]).not.toBe(contada);
  });

  it('si la base falla al devolver, la entrada ya hecha sigue: no lanza', async () => {
    vi.mocked(repoLimite.devolverIntento).mockRejectedValueOnce(new Error('sin base'));

    await expect(devolver('entrar', new Headers(), 'p'.repeat(32))).resolves.toBeUndefined();
  });
});
