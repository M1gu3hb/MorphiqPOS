import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { liquidarProfesional } from './liquidacion.ts';

/**
 * F-427 y F-259 · La liquidación y su salida de caja.
 *
 * Cuando el salón paga, sale del cajón más dinero que en ninguna otra operación
 * de la semana. Hoy eso sería «gasto: nómina», y el corte no podría decir de
 * quién ni de qué periodo. Es también el final del domingo con la calculadora.
 */

const KARLA = 'z1111111-1111-4111-8111-111111111111';
const REGLA = 'g1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T20:00:00.000Z');

const comision = (id: string, monto: bigint, extra: Record<string, unknown> = {}) => ({
  id,
  organizacion_id: ORG,
  profesional_id: KARLA,
  regla_id: REGLA,
  regla_version: 3,
  tipo: 'servicio',
  base_centavos: monto * 2n,
  tasa_bp: 5_000,
  monto_centavos: monto,
  liquidacion_id: null,
  ...extra,
});

function salon(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    profesionales: [
      { id: KARLA, organizacion_id: ORG, nombre_completo: 'Karla Méndez', activo: true },
    ],
    sesiones_caja: [
      {
        id: SESION_CAJA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        terminal_id: TERMINAL,
        estado: 'abierta',
      },
    ],
    comisiones_causadas: [comision('c1', 100_000n), comision('c2', 84_000n)],
    liquidaciones: [],
    movimientos_caja: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(salon(extra), {
    predeterminados: {
      liquidaciones: {
        material_cargado_centavos: 0n,
        movimiento_caja_id: null,
        pagada_en: null,
        pagada_por: null,
        comprobante_url: null,
      },
      movimientos_caja: { referencia_tipo: null, referencia_id: null, motivo: null },
    },
  });

const periodo = {
  profesionalId: KARLA,
  periodoDesde: '2026-09-01',
  periodoHasta: '2026-09-15',
  cobradoPorEllaCentavos: 0,
  anticiposCentavos: 0,
  propinaCentavos: 0,
  rentaCentavos: 0,
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('comision.liquidar_profesional', () => {
  it('SUMA EL LEDGER, no recalcula nada', async () => {
    // Recalcular al liquidar sería la tercera oportunidad de que el número
    // saliera distinto, y con eso vuelve el pleito que F-443 vino a cerrar.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await liquidarProfesional.ejecutar(ctx, periodo);

    expect(salida.comisionCentavos).toBe('184000');
    expect(salida.totalCentavos).toBe('184000');
  });

  it('LAS CONTRAPARTIDAS NEGATIVAS ENTRAN CON SU SIGNO', async () => {
    // «− $50, ticket 3471 cancelado a las 18:12 por Paty» aparece en la
    // liquidación en vez de desaparecer del total sin explicación.
    const base = baseDe({
      comisiones_causadas: [
        comision('c1', 100_000n),
        comision('c2', -5_000n, { tipo: 'contrapartida', motivo: 'ticket 3471 cancelado' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await liquidarProfesional.ejecutar(ctx, periodo);

    expect(salida.comisionCentavos).toBe('95000');
  });

  it('EL MOVIMIENTO DE CAJA SALE, y dice de quién', async () => {
    // Sin él, el corte diría que se gastaron $18,400 sin poder decir de quién
    // ni de qué periodo.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await liquidarProfesional.ejecutar(ctx, periodo);

    expect(base.campo('movimientos_caja', 'tipo')).toBe('liquidacion');
    // Negativo: sale del cajón.
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(-184_000n);
    expect(base.campo('movimientos_caja', 'referencia_id')).toBe(salida.liquidacionId);
    expect(String(base.campo('movimientos_caja', 'motivo'))).toContain('Karla');
  });

  it('PAGADA Y CON SU MOVIMIENTO, en la misma escritura', async () => {
    // La 135 lo exige: una liquidación pagada sin movimiento es dinero que
    // salió del cajón y no está en ningún corte.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await liquidarProfesional.ejecutar(ctx, periodo);

    expect(base.campo('liquidaciones', 'pagada_en')).toEqual(AHORA);
    expect(base.campo('liquidaciones', 'movimiento_caja_id')).toBe(salida.movimientoCajaId);
  });

  it('COMISIÓN Y PROPINA NO SE SUMAN: dos columnas', async () => {
    // La propina no es del salón: es de quien la recibió. Sumarlas haría que el
    // gasto de nómina incluyera dinero que nunca fue suyo.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await liquidarProfesional.ejecutar(ctx, { ...periodo, propinaCentavos: 30_000 });

    expect(base.campo('liquidaciones', 'comision_centavos')).toBe(184_000n);
    expect(base.campo('liquidaciones', 'propina_centavos')).toBe(30_000n);
    expect(salida.totalCentavos).toBe('214000');
  });

  it('LA RENTA SE RESTA, no se cobra aparte', async () => {
    // Cobrarla por separado obliga a dos movimientos de caja el mismo día con
    // la misma persona.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await liquidarProfesional.ejecutar(ctx, { ...periodo, rentaCentavos: 84_000 });

    expect(salida.totalCentavos).toBe('100000');
    expect(base.filas('movimientos_caja')).toHaveLength(1);
  });

  it('LAS COMISIONES QUEDAN MARCADAS, no borradas', async () => {
    // Lo causado sigue ahí con su regla y su versión, y se puede volver a leer
    // dentro de un año.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await liquidarProfesional.ejecutar(ctx, periodo);

    expect(base.filas('comisiones_causadas')).toHaveLength(2);
    expect(base.campo('comisiones_causadas', 'liquidacion_id')).toBe(salida.liquidacionId);
    expect(base.campo('comisiones_causadas', 'regla_version')).toBe(3);
  });

  it('LIQUIDAR DOS VECES no paga dos veces', async () => {
    // Sin el filtro de `liquidacion_id is null`, el ledger seguiría diciendo
    // que todo está bien mientras el cajón sale dos veces.
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);
    await liquidarProfesional.ejecutar(uno.ctx, periodo);

    const dos = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);
    const segunda = await liquidarProfesional.ejecutar(dos.ctx, {
      ...periodo,
      periodoHasta: '2026-09-30',
    });

    expect(segunda.comisionCentavos).toBe('0');
    expect(segunda.totalCentavos).toBe('0');
  });

  it('UNA LIQUIDACIÓN EN CONTRA se arrastra, no se paga', async () => {
    // Sacar dinero del cajón al revés no es una operación: con anticipos
    // grandes la persona le debe al salón, y eso se arrastra al periodo
    // siguiente.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(
      await codigoDe(() =>
        liquidarProfesional.ejecutar(ctx, { ...periodo, anticiposCentavos: 200_000 }),
      ),
    ).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('movimientos_caja')).toEqual([]);
  });

  it('SIN CAJA ABIERTA no se liquida', async () => {
    // La salida más grande del día tiene que caer en un turno que alguien vaya
    // a arquear esa noche.
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(await codigoDe(() => liquidarProfesional.ejecutar(ctx, periodo))).toBe('CAJA_CERRADA');
  });

  it('un periodo al revés no suma nada', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(
      await codigoDe(() =>
        liquidarProfesional.ejecutar(ctx, { ...periodo, periodoHasta: '2026-08-01' }),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('una persona de otro negocio', async () => {
    const base = baseDe({ profesionales: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(await codigoDe(() => liquidarProfesional.ejecutar(ctx, periodo))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });
});
