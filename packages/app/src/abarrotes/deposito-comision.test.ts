import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { depositarComision } from './deposito-comision.ts';
import { uuidDeProveedor } from './pasivos.ts';

/**
 * F-255 · Entregar el dinero ajeno.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que la entrega vaya al MISMO ledger con signo contrario. Dos tablas que se
 * restan para obtener un saldo es exactamente cómo se le paga dos veces a
 * alguien: basta con que una consulta se olvide de una de las dos.
 *
 * Que NO se pueda depositar de más. El saldo en negativo diría que Telcel le
 * debe a la tienda, y eso nunca es verdad: es un cero de más al teclear, o el
 * depósito de otro proveedor puesto en éste.
 *
 * Y que el efectivo SALGA del cajón con su movimiento. Sin esa fila, el arqueo
 * de la noche encuentra $4,000 de menos y nadie sabe por qué.
 */

const AHORA = new Date('2026-09-16T21:00:00.000Z');
const TELCEL = uuidDeProveedor('Telcel');

function pasivo(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p1',
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    naturaleza: 'servicio_terceros',
    titular_tipo: 'proveedor',
    titular_id: TELCEL,
    monto_centavos: 50_000n,
    referencia_tipo: 'recarga',
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      pasivos_terceros: [pasivo()],
      movimientos_caja: [],
      sesiones_caja: [
        {
          id: SESION_CAJA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          terminal_id: TERMINAL,
          estado: 'abierta',
        },
      ],
      ...extra,
    },
    {
      predeterminados: {
        pasivos_terceros: {
          movimiento_caja_id: null,
          sesion_caja_id: null,
          motivo: null,
          empleado_id: null,
        },
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

describe('F-255 · depositar el dinero ajeno', () => {
  it('ENTRA AL MISMO LEDGER, en negativo', async () => {
    // Dos tablas que se restan es cómo se le paga dos veces a alguien.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await depositarComision.ejecutar(ctx, {
      proveedorServicio: 'Telcel',
      montoCentavos: 30_000,
      medio: 'efectivo',
      referencia: null,
    });

    expect(base.filas('pasivos_terceros')).toHaveLength(2);
    expect(base.campo('pasivos_terceros', 'monto_centavos', 1)).toBe(-30_000n);
    expect(salida.saldoDelProveedorCentavos).toBe('20000');
  });

  it('EL EFECTIVO SALE DEL CAJÓN con su movimiento', async () => {
    // Sin esa fila el arqueo encuentra $4,000 de menos y nadie sabe por qué.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await depositarComision.ejecutar(ctx, {
      proveedorServicio: 'Telcel',
      montoCentavos: 30_000,
      medio: 'efectivo',
      referencia: null,
    });

    expect(salida.tocoElCajon).toBe(true);
    expect(base.campo('movimientos_caja', 'tipo')).toBe('retiro');
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(-30_000n);
  });

  it('LA TRANSFERENCIA NO TOCA EL CAJÓN', async () => {
    // Ya estaba en el banco, y exigir caja abierta dejaría al dueño sin poder
    // registrar un depósito que hizo desde el teléfono un domingo.
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await depositarComision.ejecutar(ctx, {
      proveedorServicio: 'Telcel',
      montoCentavos: 30_000,
      medio: 'transferencia',
      referencia: 'SPEI 99',
    });

    expect(salida.tocoElCajon).toBe(false);
    expect(base.filas('movimientos_caja')).toHaveLength(0);
  });

  it('NO SE PUEDE DEPOSITAR DE MÁS', async () => {
    // El saldo en negativo diría que Telcel le debe a la tienda.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      depositarComision.ejecutar(ctx, {
        proveedorServicio: 'Telcel',
        montoCentavos: 90_000,
        medio: 'efectivo',
        referencia: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('pasivos_terceros')).toHaveLength(1);
  });

  it('el saldo se lee SUMANDO el ledger, entregas incluidas', async () => {
    const base = baseDe({
      pasivos_terceros: [
        pasivo({ id: 'p1', monto_centavos: 50_000n }),
        pasivo({ id: 'p2', monto_centavos: -20_000n, referencia_tipo: 'entrega' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await depositarComision.ejecutar(ctx, {
      proveedorServicio: 'Telcel',
      montoCentavos: 30_000,
      medio: 'efectivo',
      referencia: null,
    });

    expect(salida.saldoDelProveedorCentavos).toBe('0');
  });

  it('«Telcel» y «telcel » son el MISMO proveedor', async () => {
    // Un titular distinto por variante de tecleo partiría el saldo en dos.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await depositarComision.ejecutar(ctx, {
      proveedorServicio: 'telcel',
      montoCentavos: 10_000,
      medio: 'transferencia',
      referencia: null,
    });

    expect(salida.saldoDelProveedorCentavos).toBe('40000');
  });

  it('sin caja abierta el efectivo no sale', async () => {
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      depositarComision.ejecutar(ctx, {
        proveedorServicio: 'Telcel',
        montoCentavos: 10_000,
        medio: 'efectivo',
        referencia: null,
      }),
    );

    expect(codigo).toBe('CAJA_CERRADA');
    expect(base.filas('pasivos_terceros')).toHaveLength(1);
  });
});
