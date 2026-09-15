import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dobles = vi.hoisted(() => ({
  db: { nombre: 'db-falsa' },
  tx: { nombre: 'tx-falsa' },
  credencialParaVerificar: vi.fn(),
  limpiarIntentos: vi.fn(),
  resolverAmbito: vi.fn(),
  crearSesion: vi.fn(),
  purgarSesionesAntiguas: vi.fn(),
  verificarPin: vi.fn(),
}));

vi.mock('@morphiqpos/data', () => ({
  obtenerDb: vi.fn(() => dobles.db),
  conTransaccion: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(dobles.tx)),
  repoIdentidad: {
    credencialParaVerificar: dobles.credencialParaVerificar,
    limpiarIntentos: dobles.limpiarIntentos,
  },
  repoSesion: {
    resolverAmbito: dobles.resolverAmbito,
    crearSesion: dobles.crearSesion,
    purgarSesionesAntiguas: dobles.purgarSesionesAntiguas,
  },
}));

vi.mock('./pin.ts', async () => {
  const original = await vi.importActual<typeof import('./pin.ts')>('./pin.ts');
  return { ...original, verificarPin: dobles.verificarPin };
});

import { verificarSesion } from '../sesion/token.ts';
import { entrarConPin } from './entrar.ts';

const AHORA = new Date('2026-03-04T10:00:00.000Z');
const ORG = '11111111-1111-4111-8111-111111111111';
const EMPLEO = '22222222-2222-4222-8222-222222222222';
const IDENTIDAD = '33333333-3333-4333-8333-333333333333';
const SECRETO = 'secreto-de-prueba-largo-y-distinto-del-real';
const FUENTE =
  process.env['MORPHIQPOS_ENTRAR_SOURCE_PATH'] ??
  fileURLToPath(new URL('./entrar.ts', import.meta.url));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(AHORA.getTime());
  dobles.verificarPin.mockResolvedValue(true);
  dobles.credencialParaVerificar.mockResolvedValue({
    credencialId: '44444444-4444-4444-8444-444444444444',
    identidadId: IDENTIDAD,
    empleoId: EMPLEO,
    organizacionId: ORG,
    pinHash: '$argon2id$hash-de-prueba',
    intentosFallidos: 0,
    bloqueadaHasta: null,
  });
  dobles.resolverAmbito.mockResolvedValue({
    organizacionId: ORG,
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

afterEach(() => vi.restoreAllMocks());

describe('entrarConPin · emisión revocable', () => {
  it('el alta persiste y purga sesiones dentro de la transacción', () => {
    const codigo = readFileSync(FUENTE, 'utf8');

    expect(codigo).toContain('await repoSesion.crearSesion');
    expect(codigo).toContain('await repoSesion.purgarSesionesAntiguas');
    expect(codigo.indexOf('await conTransaccion(async')).toBeLessThan(
      codigo.indexOf('await repoSesion.crearSesion'),
    );
  });

  it('guarda exactamente el sid que firma y su vencimiento', async () => {
    const resultado = await entrarConPin(
      {
        empleoId: EMPLEO,
        pin: '4821',
        deviceToken: '',
        organizacionId: ORG,
        pimienta: 'pimienta-de-prueba',
        secretoSesion: SECRETO,
      },
      AHORA,
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const verificado = verificarSesion(resultado.token, SECRETO);
    expect(verificado.ok).toBe(true);
    if (!verificado.ok) return;

    expect(dobles.crearSesion).toHaveBeenCalledWith(dobles.tx, {
      sid: verificado.carga.sid,
      organizacionId: ORG,
      empleoId: EMPLEO,
      creadaEn: AHORA,
      expiraEn: new Date('2026-03-04T18:00:00.000Z'),
    });
    expect(dobles.limpiarIntentos).toHaveBeenCalledWith(
      dobles.tx,
      '44444444-4444-4444-8444-444444444444',
    );
  });

  it('purga las sesiones vencidas que llevan siete días retenidas', async () => {
    await entrarConPin(
      {
        empleoId: EMPLEO,
        pin: '4821',
        deviceToken: '',
        organizacionId: ORG,
        pimienta: 'pimienta-de-prueba',
        secretoSesion: SECRETO,
      },
      AHORA,
    );

    expect(dobles.purgarSesionesAntiguas).toHaveBeenCalledWith(
      dobles.tx,
      new Date('2026-02-25T10:00:00.000Z'),
    );
  });
});
