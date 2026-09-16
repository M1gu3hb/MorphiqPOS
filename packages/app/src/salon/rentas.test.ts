import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { cobrarRenta } from './rentas.ts';

/**
 * F-441 · La renta de estación.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el monto salga de la RENTA y no de la entrada. Aceptarlo de la pantalla
 * convertiría un cobro fijo en uno negociable por teclado, y quien renta la
 * silla no depende del salón: la diferencia no se ajusta en ninguna nómina.
 *
 * Y que no se le cobre a quien ya se fue. La renta dada de baja que se sigue
 * cobrando la descubre quien recibe la llamada, no el sistema.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const RENTA = '4e000000-0000-4000-8000-000000000001';
const DANY = '9a000000-0000-4000-8000-000000000002';

function renta(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RENTA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    profesional_id: DANY,
    monto_centavos: 120_000n,
    periodicidad: 'semanal',
    dia_de_cobro: 1,
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    activa: true,
    ...cambios,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(
    { rentas_estacion: [renta()], cobros_renta: [], ...extra },
    {
      predeterminados: {
        cobros_renta: {
          movimiento_caja_id: null,
          sesion_caja_id: null,
          cobrado_por: null,
        },
      },
    },
  );

const COBRO = {
  rentaId: RENTA,
  periodoDesde: '2026-09-14',
  periodoHasta: '2026-09-21',
  metodo: 'transferencia' as const,
  sesionCajaId: null,
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-441 · cobrar la renta', () => {
  it('EL MONTO SALE DE LA RENTA, no de la entrada', async () => {
    // Aceptarlo de la pantalla convertiría un cobro fijo en uno negociable por
    // teclado, y con alguien que no depende del salón no hay dónde ajustarlo.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cobrarRenta.ejecutar(ctx, COBRO);

    expect(salida.montoCentavos).toBe('120000');
    expect(base.filas('cobros_renta')[0]?.['monto_centavos']).toBe(120_000n);
  });

  it('el cobro queda colgado de la profesional de la renta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarRenta.ejecutar(ctx, COBRO);

    expect(base.filas('cobros_renta')[0]?.['profesional_id']).toBe(DANY);
  });

  it('UNA RENTA DADA DE BAJA NO SE COBRA', async () => {
    // Es cobrarle a quien ya se fue, y lo descubre quien recibe la llamada.
    const base = baseDe({ rentas_estacion: [renta({ activa: false })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() => cobrarRenta.ejecutar(ctx, COBRO));

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('cobros_renta')).toEqual([]);
  });

  it('un periodo invertido se rechaza con palabras', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      cobrarRenta.ejecutar(ctx, { ...COBRO, periodoHasta: '2026-09-07' }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('una renta de otro negocio no existe para éste', async () => {
    const base = baseDe({ rentas_estacion: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => cobrarRenta.ejecutar(ctx, COBRO))).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('admite el descuento de liquidación como método', async () => {
    // Existe: quien renta y además hace algún servicio del salón puede pedir
    // que se le reste de ahí en vez de pagar aparte.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarRenta.ejecutar(ctx, { ...COBRO, metodo: 'descuento_liquidacion' });

    expect(base.filas('cobros_renta')[0]?.['metodo']).toBe('descuento_liquidacion');
  });
});
