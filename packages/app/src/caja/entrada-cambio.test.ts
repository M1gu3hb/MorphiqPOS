import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { registrarEntradaDeCambio } from './entrada-cambio.ts';

/**
 * Meter cambio a la caja a media mañana.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el FONDO ESPERADO suba. Si no subiera, el corte de la noche diría que
 * sobran $600 todos los días que alguien metió cambio — y un corte que sobra por
 * diseño deja de servir para detectar el faltante, que es para lo que existe.
 *
 * Que el movimiento NO sea un depósito de venta. Registrarlo como venta infla el
 * día; no registrarlo hace que el arqueo encuentre $600 de más y que el cajero
 * pase veinte minutos buscando una venta que no existe.
 *
 * Y que el desglose se conserve. «Entraron $600» no dice si se puede dar cambio;
 * «$600 en monedas de diez» sí, y ésa es la pregunta de las once.
 */

const AHORA = new Date('2026-09-16T11:00:00.000Z');

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      sesiones_caja: [
        {
          id: SESION_CAJA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          terminal_id: TERMINAL,
          estado: 'abierta',
          fondo_esperado_centavos: 150_000n,
          fondo_monedas_centavos: 20_000n,
          fondo_chicos_centavos: 30_000n,
        },
      ],
      movimientos_caja: [],
      ...extra,
    },
    {
      predeterminados: {
        movimientos_caja: { referencia_tipo: null, referencia_id: null, motivo: null },
      },
    },
  );
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('la entrada de cambio', () => {
  it('EL FONDO ESPERADO SUBE', async () => {
    // Si no subiera, el corte sobraría por diseño todos los días.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarEntradaDeCambio.ejecutar(ctx, {
      monedasCentavos: 40_000,
      chicosCentavos: 20_000,
      origen: 'banco',
      motivo: null,
    });

    expect(salida.montoCentavos).toBe('60000');
    expect(salida.fondoEsperadoCentavos).toBe('210000');
    expect(base.campo('sesiones_caja', 'fondo_esperado_centavos')).toBe(210_000n);
  });

  it('EL DESGLOSE SE CONSERVA', async () => {
    // «Entraron $600» no dice si se puede dar cambio.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarEntradaDeCambio.ejecutar(ctx, {
      monedasCentavos: 40_000,
      chicosCentavos: 20_000,
      origen: 'banco',
      motivo: null,
    });

    expect(base.campo('sesiones_caja', 'fondo_monedas_centavos')).toBe(60_000n);
    expect(base.campo('sesiones_caja', 'fondo_chicos_centavos')).toBe(50_000n);
  });

  it('NO ES UN DEPÓSITO DE VENTA: lleva su propio tipo', async () => {
    // El corte los suma distinto: el depósito entró POR una venta y esto es
    // fondo que alguien puso.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarEntradaDeCambio.ejecutar(ctx, {
      monedasCentavos: 10_000,
      chicosCentavos: 0,
      origen: 'dueno',
      motivo: null,
    });

    expect(base.campo('movimientos_caja', 'tipo')).toBe('entrada_cambio');
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(10_000n);
  });

  it('el ORIGEN queda escrito, porque casi siempre es la bolsa de alguien', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarEntradaDeCambio.ejecutar(ctx, {
      monedasCentavos: 10_000,
      chicosCentavos: 0,
      origen: 'caja_chica',
      motivo: null,
    });

    expect(String(base.campo('movimientos_caja', 'motivo'))).toContain('caja_chica');
  });

  it('un movimiento de CERO se rechaza', async () => {
    // Es una línea en el corte que hay que leer y que no dice nada.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      registrarEntradaDeCambio.ejecutar(ctx, {
        monedasCentavos: 0,
        chicosCentavos: 0,
        origen: 'banco',
        motivo: null,
      }),
    );

    expect(codigo).toBe('CANTIDAD_INVALIDA');
    expect(base.filas('movimientos_caja')).toHaveLength(0);
  });

  it('sin caja abierta no entra nada', async () => {
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      registrarEntradaDeCambio.ejecutar(ctx, {
        monedasCentavos: 10_000,
        chicosCentavos: 0,
        origen: 'banco',
        motivo: null,
      }),
    );

    expect(codigo).toBe('CAJA_CERRADA');
  });
});
