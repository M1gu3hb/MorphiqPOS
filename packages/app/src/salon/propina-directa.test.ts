import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { entregarPropina, recibirPropina } from './propina-directa.ts';

/**
 * F-243 · La propina directa a la profesional.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el saldo sea una SUMA sobre una tabla —lo recibido en positivo, lo
 * entregado en negativo— y que no se pueda entregar más de lo que se debe.
 * Entregar de más es sacar del cajón dinero del negocio creyendo que es ajeno:
 * el corte cuadra esa noche y el faltante aparece al cerrar el mes, cuando ya
 * nadie recuerda el movimiento.
 */

const AHORA = new Date('2026-09-16T20:00:00.000Z');
const KARLA = '9a000000-0000-4000-8000-000000000001';

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(
    {
      profesionales: [{ id: KARLA, organizacion_id: ORG, activo: true }],
      movimientos_propina: [],
      ...extra,
    },
    {
      predeterminados: {
        movimientos_propina: {
          sucursal_id: null,
          orden_id: null,
          cita_servicio_id: null,
          liquidacion_id: null,
          movimiento_caja_id: null,
          entregada_en: null,
          entregada_por: null,
          nota: null,
        },
      },
    },
  );

function movimiento(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'm1',
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    profesional_id: KARLA,
    tipo: 'recibida',
    monto_centavos: 15_000n,
    medio: 'tarjeta',
    ...cambios,
  };
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-243 · recibir', () => {
  it('lo recibido entra en POSITIVO y es de ELLA, no del bote', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirPropina.ejecutar(ctx, {
      profesionalId: KARLA,
      ordenId: null,
      citaServicioId: null,
      montoCentavos: 15_000,
      medio: 'tarjeta',
    });

    const fila = base.filas('movimientos_propina')[0];
    expect(fila?.['tipo']).toBe('recibida');
    expect(fila?.['monto_centavos']).toBe(15_000n);
    expect(fila?.['profesional_id']).toBe(KARLA);
    expect(salida.saldoCentavos).toBe('15000');
  });

  it('NO pasa por la venta: no hay orden ni línea nueva', async () => {
    // Registrarla como ingreso inflaría la venta, el IVA y la comisión que se
    // calcula sobre esa venta: el salón acabaría pagándole comisión a la
    // estilista sobre su propia propina.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await recibirPropina.ejecutar(ctx, {
      profesionalId: KARLA,
      ordenId: null,
      citaServicioId: null,
      montoCentavos: 15_000,
      medio: 'efectivo',
    });

    expect(base.filas('ordenes')).toEqual([]);
  });

  it('el saldo ACUMULA lo de todo el día', async () => {
    const base = baseDe({ movimientos_propina: [movimiento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirPropina.ejecutar(ctx, {
      profesionalId: KARLA,
      ordenId: null,
      citaServicioId: null,
      montoCentavos: 5_000,
      medio: 'efectivo',
    });

    expect(salida.saldoCentavos).toBe('20000');
  });

  it('una profesional de otro negocio no existe para éste', async () => {
    const base = baseDe({ profesionales: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      recibirPropina.ejecutar(ctx, {
        profesionalId: KARLA,
        ordenId: null,
        citaServicioId: null,
        montoCentavos: 5_000,
        medio: 'efectivo',
      }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});

describe('F-243 · entregar', () => {
  it('lo entregado RESTA, y queda firmado', async () => {
    const base = baseDe({ movimientos_propina: [movimiento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await entregarPropina.ejecutar(ctx, {
      profesionalId: KARLA,
      montoCentavos: 10_000,
      medio: 'efectivo',
    });

    const entrega = base.filas('movimientos_propina')[1];
    // Negativo: un «entregada» positivo haría crecer el saldo al pagar.
    expect(entrega?.['monto_centavos']).toBe(-10_000n);
    expect(entrega?.['entregada_en']).toEqual(AHORA);
    expect(entrega?.['entregada_por']).not.toBeNull();
    expect(salida.saldoCentavos).toBe('5000');
  });

  it('NO SE ENTREGA MÁS DE LO QUE SE DEBE', async () => {
    // Es sacar del cajón dinero del negocio creyendo que es ajeno. El corte
    // cuadra esa noche y el faltante aparece al cerrar el mes.
    const base = baseDe({ movimientos_propina: [movimiento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const codigo = await codigoDe(() =>
      entregarPropina.ejecutar(ctx, {
        profesionalId: KARLA,
        montoCentavos: 20_000,
        medio: 'efectivo',
      }),
    );

    expect(codigo).toBe('EFECTIVO_INSUFICIENTE');
    expect(base.filas('movimientos_propina')).toHaveLength(1);
  });

  it('entregar TODO deja el saldo en cero, no en negativo', async () => {
    const base = baseDe({ movimientos_propina: [movimiento()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await entregarPropina.ejecutar(ctx, {
      profesionalId: KARLA,
      montoCentavos: 15_000,
      medio: 'efectivo',
    });

    expect(salida.saldoCentavos).toBe('0');
  });

  it('sin nada recibido no hay nada que entregar', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const codigo = await codigoDe(() =>
      entregarPropina.ejecutar(ctx, {
        profesionalId: KARLA,
        montoCentavos: 100,
        medio: 'efectivo',
      }),
    );

    expect(codigo).toBe('EFECTIVO_INSUFICIENTE');
  });
});
