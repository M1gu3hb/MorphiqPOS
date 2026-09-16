import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { documentoDeCorte } from './documento.ts';

/**
 * F-259 · El documento del corte.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el esperado sea fondo + lo que entró − lo retirado, y que la diferencia
 * se diga con signo. Un corte que sólo enseña lo contado no se puede cuadrar.
 *
 * Que los movimientos sean los DEL TRAMO del corte y no los de la sesión
 * entera: una sesión con tres cortes de turno tiene tres documentos, y sumarle
 * a cada uno todo el día haría que los tres dijeran el mismo total y ninguno
 * cuadrara.
 *
 * Y que los movimientos SIN MOTIVO se cuenten. «Faltan $340» no le sirve a
 * nadie; «faltan $340 y hubo tres retiros sin explicación» sí.
 */

const AHORA = new Date('2026-09-16T22:00:00.000Z');
const CORTE = 'c0000000-0000-4000-8000-000000000001';

const hora = (h: number) => new Date(Date.UTC(2026, 8, 16, h, 0, 0, 0));

function corte(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CORTE,
    organizacion_id: ORG,
    sesion_caja_id: SESION_CAJA,
    serie: 'A',
    folio: 12n,
    rango_inicio: hora(14),
    cortado_en: hora(22),
    empleado_id: 'e1',
    efectivo_contado_centavos: 150_000n,
    efectivo_retirado_centavos: 0n,
    notas: null,
    // Lo que el `innerJoin` con `sesiones_caja` traería: la base falsa resuelve
    // sobre una tabla y las columnas de la otra se siembran en la misma fila.
    terminal_id: TERMINAL,
    fondo_inicial_centavos: 100_000n,
    ...cambios,
  };
}

function movimiento(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'm1',
    organizacion_id: ORG,
    sesion_caja_id: SESION_CAJA,
    tipo: 'venta_efectivo',
    monto_centavos: 60_000n,
    motivo: 'venta',
    empleado_id: 'e1',
    created_at: hora(16),
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    cortes_turno: [corte()],
    sesiones_caja: [],
    movimientos_caja: [],
    ...extra,
  });
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-259 · el documento del corte', () => {
  it('EL ESPERADO es fondo + entradas − retirado', async () => {
    const base = baseDe({ movimientos_caja: [movimiento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await documentoDeCorte.ejecutar(ctx, { corteId: CORTE });

    expect(salida.efectivoEsperadoCentavos).toBe('160000');
    // Contado 150 000 contra esperado 160 000: faltan 10 000, con signo.
    expect(salida.diferenciaCentavos).toBe('-10000');
  });

  it('el folio lleva SERIE y número', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await documentoDeCorte.ejecutar(ctx, { corteId: CORTE });

    expect(salida.folio).toBe('A-12');
  });

  it('SÓLO LOS MOVIMIENTOS DEL TRAMO, no los de toda la sesión', async () => {
    // Una sesión con tres cortes tiene tres documentos: sumarle a cada uno todo
    // el día haría que los tres dijeran el mismo total y ninguno cuadrara.
    const base = baseDe({
      movimientos_caja: [
        movimiento({ id: 'antes', created_at: hora(10), monto_centavos: 99_000n }),
        movimiento({ id: 'dentro', created_at: hora(16), monto_centavos: 60_000n }),
        movimiento({ id: 'despues', created_at: hora(23), monto_centavos: 77_000n }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await documentoDeCorte.ejecutar(ctx, { corteId: CORTE });

    expect(salida.movimientos.map((m) => m.movimientoId)).toEqual(['dentro']);
    expect(salida.efectivoEsperadoCentavos).toBe('160000');
  });

  it('CUENTA LOS MOVIMIENTOS SIN MOTIVO', async () => {
    // «Faltan $340 y hubo tres retiros sin explicación» es una conversación que
    // se puede tener; «faltan $340» no.
    const base = baseDe({
      movimientos_caja: [
        movimiento({ id: 'r1', tipo: 'retiro', monto_centavos: -10_000n, motivo: null }),
        movimiento({ id: 'r2', tipo: 'retiro', monto_centavos: -10_000n, motivo: '   ' }),
        movimiento({ id: 'r3', tipo: 'retiro', monto_centavos: -10_000n, motivo: 'banco' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await documentoDeCorte.ejecutar(ctx, { corteId: CORTE });

    const retiros = salida.renglones.find((r) => r.tipo === 'retiro');
    expect(retiros?.movimientos).toBe(3);
    expect(retiros?.sinMotivo).toBe(2);
    expect(retiros?.montoCentavos).toBe('-30000');
  });

  it('agrupa POR TIPO sin perder el detalle', async () => {
    const base = baseDe({
      movimientos_caja: [
        movimiento({ id: 'v1', tipo: 'venta_efectivo', monto_centavos: 40_000n }),
        movimiento({ id: 'v2', tipo: 'venta_efectivo', monto_centavos: 20_000n }),
        movimiento({ id: 'r1', tipo: 'retiro', monto_centavos: -5_000n, motivo: 'banco' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await documentoDeCorte.ejecutar(ctx, { corteId: CORTE });

    expect(salida.renglones).toHaveLength(2);
    expect(salida.movimientos).toHaveLength(3);
    expect(salida.renglones.find((r) => r.tipo === 'venta_efectivo')?.montoCentavos).toBe('60000');
  });

  it('lo RETIRADO se descuenta de lo esperado', async () => {
    // El dinero que se llevó al banco no puede seguir estando en el cajón.
    const base = baseDe({
      cortes_turno: [corte({ efectivo_retirado_centavos: 50_000n })],
      movimientos_caja: [movimiento()],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await documentoDeCorte.ejecutar(ctx, { corteId: CORTE });

    expect(salida.efectivoEsperadoCentavos).toBe('110000');
  });

  it('un corte de otro negocio no existe', async () => {
    const base = baseDe({ cortes_turno: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect(await codigoDe(() => documentoDeCorte.ejecutar(ctx, { corteId: CORTE }))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });
});
