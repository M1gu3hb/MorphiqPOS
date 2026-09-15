import type { Transaccion } from '@morphiqpos/data';
import { repoCaja } from '@morphiqpos/data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { entradaEstadoCaja, estadoDeCaja } from './consulta.ts';

vi.mock('@morphiqpos/data', async () => {
  const original = await vi.importActual<typeof import('@morphiqpos/data')>('@morphiqpos/data');
  return {
    ...original,
    repoCaja: {
      sesionAbiertaDeTerminal: vi.fn(),
      arqueoDeSesion: vi.fn(),
      movimientosDeCorte: vi.fn(),
    },
  };
});

const CONTEXTO = {
  ambito: {
    organizacionId: '11111111-1111-4111-8111-111111111111',
    sucursalId: '22222222-2222-4222-8222-222222222222',
    terminalId: '33333333-3333-4333-8333-333333333333',
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId: '55555555-5555-4555-8555-555555555555',
    rol: 'cajero' as const,
  },
  correlationId: 'prueba-arqueo',
  ahora: new Date('2026-09-14T12:00:00.000Z'),
  tx: {} as Transaccion,
  paso: <T>(_nombre: string, fn: () => Promise<T>) => fn(),
  auditar: vi.fn(),
};

describe('D-3 · arqueo visible después del conteo', () => {
  beforeEach(() => {
    vi.mocked(repoCaja.sesionAbiertaDeTerminal).mockReset();
    vi.mocked(repoCaja.arqueoDeSesion).mockReset();
    vi.mocked(repoCaja.movimientosDeCorte).mockReset();
    vi.mocked(repoCaja.sesionAbiertaDeTerminal).mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      sucursalId: '22222222-2222-4222-8222-222222222222',
      terminalId: '33333333-3333-4333-8333-333333333333',
      serie: 'CC',
      fondoInicialCentavos: 200_000n,
      abiertaEn: new Date('2026-09-14T08:00:00.000Z'),
    });
    vi.mocked(repoCaja.arqueoDeSesion).mockResolvedValue({
      fondoInicialCentavos: 200_000n,
      movimientosCentavos: 232_000n,
      ventasCentavos: 30_000n,
      efectivoEsperadoCentavos: 232_000n,
      numeroVentas: 1,
    });
    vi.mocked(repoCaja.movimientosDeCorte).mockResolvedValue([]);
  });

  it('oculta el esperado sin conteo y entrega el cálculo del servidor cuando ya se contó', async () => {
    const ciego = await estadoDeCaja.ejecutar(CONTEXTO, entradaEstadoCaja.parse({}));
    expect(ciego).not.toHaveProperty('efectivoEsperadoCentavos');
    expect(ciego).not.toHaveProperty('diferenciaCentavos');

    const contado = await estadoDeCaja.ejecutar(
      CONTEXTO,
      entradaEstadoCaja.parse({ efectivoContadoCentavos: 232_000 }),
    );
    expect(contado).toMatchObject({
      fondoInicialCentavos: '200000',
      ventasCentavos: '30000',
      efectivoEsperadoCentavos: '232000',
      diferenciaCentavos: '0',
    });
  });
});
