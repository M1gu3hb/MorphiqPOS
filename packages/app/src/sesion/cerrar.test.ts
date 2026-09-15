import { beforeEach, describe, expect, it, vi } from 'vitest';

import { firmarSesion } from './token.ts';

const dobles = vi.hoisted(() => ({
  obtenerDb: vi.fn(() => ({ nombre: 'db-falsa' })),
  revocarSesion: vi.fn(),
}));

vi.mock('@morphiqpos/data', () => ({
  obtenerDb: dobles.obtenerDb,
  repoSesion: { revocarSesion: dobles.revocarSesion },
}));

import { cerrarSesion } from './cerrar.ts';

const SECRETO = 'secreto-de-prueba-largo-y-distinto-del-real';
const SID = '0123456789abcdef0123456789abcdef';

function token(): string {
  return firmarSesion(
    {
      sid: SID,
      identidadId: '33333333-3333-4333-8333-333333333333',
      empleoId: '22222222-2222-4222-8222-222222222222',
      terminalId: null,
      exp: 4_102_444_800,
    },
    SECRETO,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('cerrarSesion', () => {
  it('revoca el sid firmado antes de que la ruta borre la cookie', async () => {
    await cerrarSesion(token(), SECRETO, new Date('2026-03-04T10:00:00.000Z'));

    expect(dobles.revocarSesion).toHaveBeenCalledWith(
      expect.anything(),
      SID,
      new Date('2026-03-04T10:00:00.000Z'),
    );
  });

  it('no toca la base cuando la cookie fue manipulada', async () => {
    await cerrarSesion(`${token()}alterado`, SECRETO);

    expect(dobles.revocarSesion).not.toHaveBeenCalled();
  });
});
