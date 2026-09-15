import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { firmarSesion } from './token.ts';

const dobles = vi.hoisted(() => ({
  obtenerDb: vi.fn(() => ({ nombre: 'db-falsa' })),
  sesionActiva: vi.fn(),
  resolverAmbito: vi.fn(),
  terminalActiva: vi.fn(),
}));

vi.mock('@morphiqpos/data', () => ({
  obtenerDb: dobles.obtenerDb,
  repoSesion: {
    sesionActiva: dobles.sesionActiva,
    resolverAmbito: dobles.resolverAmbito,
    terminalActiva: dobles.terminalActiva,
  },
}));

import { resolverSesion } from './resolver.ts';

const SECRETO = 'secreto-de-prueba-largo-y-distinto-del-real';
const SID = '0123456789abcdef0123456789abcdef';
const EMPLEO = '22222222-2222-4222-8222-222222222222';
const IDENTIDAD = '33333333-3333-4333-8333-333333333333';
const FUENTE =
  process.env['MORPHIQPOS_SESSION_RESOLVER_SOURCE_PATH'] ??
  fileURLToPath(new URL('./resolver.ts', import.meta.url));

function token(sid = SID): string {
  return firmarSesion(
    {
      sid,
      identidadId: IDENTIDAD,
      empleoId: EMPLEO,
      terminalId: null,
      exp: 4_102_444_800,
    },
    SECRETO,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dobles.sesionActiva.mockResolvedValue(true);
  dobles.resolverAmbito.mockResolvedValue({
    organizacionId: '11111111-1111-4111-8111-111111111111',
    sucursalId: null,
    identidadId: IDENTIDAD,
    empleoId: EMPLEO,
    rol: 'dueno',
    nombrePersona: 'Rosa',
    paquete: 'restaurante_pro',
    nombreNegocio: 'Morphiq',
    nombreSucursal: null,
  });
});

describe('resolverSesion · registro revocable', () => {
  it('el código consulta el registro antes de resolver el ámbito', () => {
    const codigo = readFileSync(FUENTE, 'utf8');
    const registro = codigo.indexOf('await repoSesion.sesionActiva');
    const ambito = codigo.indexOf('await repoSesion.resolverAmbito');

    expect(registro).toBeGreaterThan(-1);
    expect(ambito).toBeGreaterThan(registro);
  });

  it('rechaza una cookie bien firmada cuyo sid no está activo', async () => {
    dobles.sesionActiva.mockResolvedValueOnce(false);

    const resultado = await resolverSesion({ secreto: SECRETO, token: token() });

    expect(resultado).toEqual({ ok: false, motivo: 'revocada' });
    expect(dobles.sesionActiva).toHaveBeenCalledWith(expect.anything(), SID, EMPLEO);
    expect(dobles.resolverAmbito).not.toHaveBeenCalled();
  });

  it('no acepta el sid activo de otro empleo', async () => {
    dobles.sesionActiva.mockResolvedValueOnce(false);

    const resultado = await resolverSesion({
      secreto: SECRETO,
      token: token('sid-de-otra-sesion'),
    });

    expect(resultado).toEqual({ ok: false, motivo: 'revocada' });
    expect(dobles.sesionActiva).toHaveBeenCalledWith(
      expect.anything(),
      'sid-de-otra-sesion',
      EMPLEO,
    );
  });

  it('resuelve el ámbito sólo después de comprobar el sid', async () => {
    const resultado = await resolverSesion({ secreto: SECRETO, token: token() });

    expect(resultado.ok).toBe(true);
    expect(dobles.sesionActiva.mock.invocationCallOrder[0]).toBeLessThan(
      dobles.resolverAmbito.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
