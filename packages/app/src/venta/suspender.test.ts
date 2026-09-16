import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { retomarVenta, suspenderVenta, ventasEnEspera } from './suspender.ts';

/**
 * F-224 · La venta que se aparta para atender a otro.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que el código sea CORTO y se recicle. «Tu venta es la 47» se dice en voz alta;
 * un uuid no se dice y un consecutivo global haría que el del martes fuera
 * 1,284. Reciclarlo exige liberarlo al retomar: dejarlo puesto haría que a la
 * tercera venta del día los códigos ya no fueran cortos.
 *
 * Que suspender NO mueva inventario. El descuento cuelga del cobro, y ésta no se
 * cobró: descontar aquí deja el anaquel corto mientras el cliente busca el pan,
 * y corto para siempre si no vuelve.
 *
 * Y que dos cajas no compartan número. Sin el filtro por terminal, la caja 2
 * retomaría la venta de la caja 1 con el mismo «47».
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const OTRA_TERMINAL = 'ff000000-0000-4000-8000-000000000001';
const ORDEN = 'ab000000-0000-4000-8000-000000000001';

function orden(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDEN,
    organizacion_id: ORG,
    terminal_id: TERMINAL,
    estado: 'borrador',
    total_centavos: 48_700n,
    codigo_espera: null,
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    ordenes: [orden()],
    orden_lineas: [
      { id: 'l1', organizacion_id: ORG, orden_id: ORDEN },
      { id: 'l2', organizacion_id: ORG, orden_id: ORDEN },
    ],
    movimientos_stock: [],
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

describe('F-224 · suspender', () => {
  it('EL CÓDIGO ES CORTO: se dice en voz alta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await suspenderVenta.ejecutar(ctx, { ordenId: ORDEN, nota: null });

    expect(salida.codigo).toBe('1');
    expect(base.campo('ordenes', 'estado')).toBe('suspendida');
    expect(base.campo('ordenes', 'codigo_espera')).toBe('1');
  });

  it('EL CÓDIGO SE RECICLA sin chocar con los vivos', async () => {
    const base = baseDe({
      ordenes: [
        orden(),
        orden({ id: 'vieja1', estado: 'suspendida', codigo_espera: '1' }),
        orden({ id: 'vieja2', estado: 'suspendida', codigo_espera: '2' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await suspenderVenta.ejecutar(ctx, { ordenId: ORDEN, nota: null });

    expect(salida.codigo).toBe('3');
  });

  it('el código de OTRA CAJA no estorba', async () => {
    // Sin el filtro por terminal, la caja 2 retomaría la venta de la caja 1.
    const base = baseDe({
      ordenes: [
        orden(),
        orden({
          id: 'deOtraCaja',
          terminal_id: OTRA_TERMINAL,
          estado: 'suspendida',
          codigo_espera: '1',
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await suspenderVenta.ejecutar(ctx, { ordenId: ORDEN, nota: null });

    expect(salida.codigo).toBe('1');
  });

  it('SUSPENDER NO MUEVE INVENTARIO', async () => {
    // El descuento cuelga del cobro. Descontar aquí deja el anaquel corto para
    // siempre si el cliente no vuelve.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await suspenderVenta.ejecutar(ctx, { ordenId: ORDEN, nota: null });

    expect(base.filas('movimientos_stock')).toHaveLength(0);
  });

  it('un carrito VACÍO no se aparta', async () => {
    // Quemaría un código y dejaría a alguien buscando qué se apartó.
    const base = baseDe({ orden_lineas: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      suspenderVenta.ejecutar(ctx, { ordenId: ORDEN, nota: null }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.campo('ordenes', 'estado')).toBe('borrador');
  });

  it('una orden ya COBRADA no se aparta', async () => {
    const base = baseDe({ ordenes: [orden({ estado: 'pagada' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      suspenderVenta.ejecutar(ctx, { ordenId: ORDEN, nota: null }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });
});

describe('F-224 · lo que hay apartado', () => {
  it('lista las de ESTA caja, con los minutos que llevan', async () => {
    // Una apartada hace dos horas casi siempre es alguien que ya no volvió.
    const base = baseDe({
      ordenes: [
        orden({
          id: 'a',
          estado: 'suspendida',
          codigo_espera: '1',
          updated_at: new Date(AHORA.getTime() - 40 * 60_000),
        }),
        orden({
          id: 'b',
          terminal_id: OTRA_TERMINAL,
          estado: 'suspendida',
          codigo_espera: '1',
          updated_at: AHORA,
        }),
      ],
      orden_lineas: [{ id: 'l1', organizacion_id: ORG, orden_id: 'a' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await ventasEnEspera.ejecutar(ctx, {});

    expect(salida.ventas.map((v) => v.ordenId)).toEqual(['a']);
    expect(salida.ventas[0]?.minutosEsperando).toBe(40);
    expect(salida.ventas[0]?.lineas).toBe(1);
  });

  it('sin nada apartado devuelve la lista vacía', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await ventasEnEspera.ejecutar(ctx, {});

    expect(salida.ventas).toEqual([]);
  });
});

describe('F-224 · retomar', () => {
  it('LIBERA EL CÓDIGO al retomar', async () => {
    // Dejarlo puesto haría que la siguiente suspensión tuviera que saltárselo,
    // y a la tercera venta del día los códigos ya no serían cortos.
    const base = baseDe({
      ordenes: [orden({ estado: 'suspendida', codigo_espera: '7' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await retomarVenta.ejecutar(ctx, { codigo: '7' });

    expect(salida.ordenId).toBe(ORDEN);
    expect(base.campo('ordenes', 'estado')).toBe('borrador');
    expect(base.campo('ordenes', 'codigo_espera')).toBeNull();
  });

  it('un código que no existe lo dice con el número', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() => retomarVenta.ejecutar(ctx, { codigo: '9' }));

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('no se retoma la apartada de OTRA CAJA', async () => {
    const base = baseDe({
      ordenes: [orden({ terminal_id: OTRA_TERMINAL, estado: 'suspendida', codigo_espera: '7' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() => retomarVenta.ejecutar(ctx, { codigo: '7' }));

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});
