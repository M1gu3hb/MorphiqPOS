import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { aplicarAnticipo, recibirAnticipo } from './anticipos.ts';

/**
 * F-414 · El anticipo de la cita.
 *
 * ── Las dos cosas que esta prueba defiende ───────────────────────────────
 * Que el anticipo NO se cobre por una cita que ya no está esperando —cobrar por
 * nada lo descubre el cliente, no el sistema— y que aplicarlo EXIJA la orden:
 * un pasivo que desaparece sin destino deja una diferencia al cuadrar el mes de
 * la que no se puede tirar del hilo.
 *
 * ── Y una que NO se prueba aquí, a propósito ─────────────────────────────
 * Que dos anticipos vivos no puedan coexistir. Eso lo impide el `unique`
 * parcial de la migración 138, y el doble en memoria no modela índices: una
 * prueba que lo afirmara aquí estaría mintiendo. Queda dicho en el comando.
 */

const AHORA = new Date('2026-09-15T12:00:00.000Z');
const CITA = 'c1a00000-0000-4000-8000-000000000001';
const CLIENTA = 'c1000000-0000-4000-8000-000000000002';
const ANTICIPO = 'a0000000-0000-4000-8000-000000000003';
const ORDEN = '0d000000-0000-4000-8000-000000000004';

function tabla(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    citas: [{ id: CITA, organizacion_id: ORG, estado: 'agendada', cliente_id: CLIENTA }],
    anticipos_cita: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(tabla(extra), {
    predeterminados: {
      anticipos_cita: {
        movimiento_caja_id: null,
        sesion_caja_id: null,
        orden_id: null,
        recibido_por: null,
        resuelto_en: null,
        motivo_resolucion: null,
        cliente_id: null,
      },
    },
  });

function anticipoGuardado(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ANTICIPO,
    organizacion_id: ORG,
    cita_id: CITA,
    cliente_id: CLIENTA,
    monto_centavos: 30_000n,
    metodo: 'tarjeta',
    estado: 'vivo',
    orden_id: null,
    resuelto_en: null,
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

describe('F-414 · recibir', () => {
  it('nace VIVO y colgado de la clienta de la cita', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await recibirAnticipo.ejecutar(ctx, {
      citaId: CITA,
      montoCentavos: 30_000,
      metodo: 'tarjeta',
    });

    expect(salida.estado).toBe('vivo');
    const fila = base.filas('anticipos_cita')[0];
    expect(fila?.['monto_centavos']).toBe(30_000n);
    // La clienta NO viene de la entrada: se lee de la cita, o se podría cobrar
    // un anticipo a nombre de otra persona.
    expect(fila?.['cliente_id']).toBe(CLIENTA);
  });

  it('NO SE COBRA por una cita que ya se atendió', async () => {
    // Cobrar por nada lo descubre el cliente, no el sistema.
    const base = baseDe({
      citas: [{ id: CITA, organizacion_id: ORG, estado: 'cobrada', cliente_id: CLIENTA }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      recibirAnticipo.ejecutar(ctx, { citaId: CITA, montoCentavos: 30_000, metodo: 'efectivo' }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('anticipos_cita')).toEqual([]);
  });

  it('una cita de otro negocio no existe para éste', async () => {
    const base = baseDe({ citas: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      recibirAnticipo.ejecutar(ctx, { citaId: CITA, montoCentavos: 30_000, metodo: 'efectivo' }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});

describe('F-414 · aplicar', () => {
  it('deja ORDEN y FECHA en la misma escritura', async () => {
    const base = baseDe({ anticipos_cita: [anticipoGuardado()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await aplicarAnticipo.ejecutar(ctx, { anticipoId: ANTICIPO, ordenId: ORDEN });

    const fila = base.filas('anticipos_cita')[0];
    expect(fila?.['estado']).toBe('aplicado');
    // Sin la orden, el pasivo desaparece sin destino y al cuadrar el mes no hay
    // de dónde tirar del hilo.
    expect(fila?.['orden_id']).toBe(ORDEN);
    expect(fila?.['resuelto_en']).toEqual(AHORA);
  });

  it('APLICARLO DOS VECES NO DESCUENTA DOS VECES', async () => {
    const base = baseDe({
      anticipos_cita: [anticipoGuardado({ estado: 'aplicado', orden_id: ORDEN })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      aplicarAnticipo.ejecutar(ctx, { anticipoId: ANTICIPO, ordenId: ORDEN }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('un anticipo RETENIDO ya no se aplica', async () => {
    // Se retuvo por un no-show: aplicarlo después sería devolvérselo por la
    // puerta de atrás, sin que nadie lo decidiera.
    const base = baseDe({
      anticipos_cita: [anticipoGuardado({ estado: 'retenido', resuelto_en: AHORA })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      aplicarAnticipo.ejecutar(ctx, { anticipoId: ANTICIPO, ordenId: ORDEN }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('uno que no existe no se inventa', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      aplicarAnticipo.ejecutar(ctx, { anticipoId: ANTICIPO, ordenId: ORDEN }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});
