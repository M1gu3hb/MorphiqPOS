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
    estrategia_captura: 'mostrador',
    // Un borrador no tiene total: se congela al cobrar.
    total_centavos: 0n,
    codigo_espera: null,
    notas: null,
    ...cambios,
  };
}

function linea(id: string, ordenId: string, subtotal: bigint, visual: number) {
  return {
    id,
    organizacion_id: ORG,
    orden_id: ordenId,
    producto_id: `p-${id}`,
    producto_nombre: `Producto ${id}`,
    cantidad: '1.0000',
    unidad: 'pieza',
    precio_unitario_centavos: subtotal,
    costo_unitario_centavos: 0n,
    descuento_centavos: 0n,
    subtotal_centavos: subtotal,
    total_centavos: subtotal,
    es_mayoreo: false,
    tipo_venta: 'precio_fijo',
    orden_visual: visual,
    codigo_barras: `75010${id}`,
    cantidad_base_consumo: null,
    anulada_en: null,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa({
    ordenes: [orden()],
    orden_lineas: [linea('l1', ORDEN, 20_000n, 1), linea('l2', ORDEN, 28_700n, 2)],
    movimientos_stock: [],
    configuracion: [],
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

  it('GUARDA EL TOTAL y la nota: la lista no enseña «$0.00» ni pierde a quién es', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await suspenderVenta.ejecutar(ctx, { ordenId: ORDEN, nota: 'el de la gorra' });

    expect(salida.totalCentavos).toBe('48700');
    expect(base.campo('ordenes', 'total_centavos')).toBe(48_700n);
    expect(base.campo('ordenes', 'notas')).toBe('el de la gorra');
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
          notas: 'el de la gorra',
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
      orden_lineas: [linea('l1', 'a', 1_000n, 1)],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await ventasEnEspera.ejecutar(ctx, {});

    expect(salida.ventas.map((v) => v.ordenId)).toEqual(['a']);
    expect(salida.ventas[0]?.minutosEsperando).toBe(40);
    expect(salida.ventas[0]?.lineas).toBe(1);
    expect(salida.ventas[0]?.nota).toBe('el de la gorra');
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

  it('DEVUELVE LOS RENGLONES, en su orden, para volver a pintar la venta', async () => {
    // Guardados al revés: el orden lo pone `orden_visual`, no el de la tabla.
    const base = baseDe({
      ordenes: [orden({ estado: 'suspendida', codigo_espera: '7' })],
      orden_lineas: [linea('l2', ORDEN, 28_700n, 2), linea('l1', ORDEN, 20_000n, 1)],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await retomarVenta.ejecutar(ctx, { codigo: '7' });

    expect(salida.renglones.map((r) => r.nombre)).toEqual(['Producto l1', 'Producto l2']);
    expect(salida.renglones[1]).toMatchObject({
      productoId: 'p-l2',
      cantidad: '1.0000',
      precioUnitarioCentavos: '28700',
      codigoBarras: '75010l2',
    });
  });

  it('un carrito VACÍO de esta caja se retira: si no, chocaría con el índice de un borrador por caja', async () => {
    const base = baseDe({
      ordenes: [
        orden({ estado: 'suspendida', codigo_espera: '7' }),
        orden({ id: 'vacio', estado: 'borrador' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await retomarVenta.ejecutar(ctx, { codigo: '7' });

    expect(base.filas('ordenes').map((o) => o['id'])).toEqual([ORDEN]);
  });

  it('una venta A MEDIAS en esta caja no se pisa', async () => {
    const base = baseDe({
      ordenes: [
        orden({ estado: 'suspendida', codigo_espera: '7' }),
        orden({ id: 'a-medias', estado: 'borrador' }),
      ],
      orden_lineas: [linea('l1', ORDEN, 1_000n, 1), linea('x', 'a-medias', 500n, 1)],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() => retomarVenta.ejecutar(ctx, { codigo: '7' }));

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('ordenes')).toHaveLength(2);
    expect(base.filas('ordenes').find((o) => o['id'] === ORDEN)?.['estado']).toBe('suspendida');
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
