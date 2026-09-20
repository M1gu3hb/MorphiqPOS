import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { ajustarConteo } from './cierre-de-zona.ts';

/**
 * F-149 · Cerrar la zona contada en UN viaje.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que los veinte minutos de recorrido acaben en una toma cerrada, con su ajuste
 * como MOVIMIENTO —no como un `update` a la existencia— y con la zona sellada:
 * sin el sello, mañana vuelve a tocar el mismo anaquel y el recorrido nunca
 * avanza.
 *
 * Que un insumo de OTRA zona no se pueda ajustar aquí. No hace falta mala fe:
 * basta una pantalla con la lista de ayer, y el ajuste quedaría con el sello de
 * un conteo que nadie hizo en ese anaquel.
 *
 * Que el motivo se compruebe ANTES de abrir la toma. Con la comprobación
 * después, un motivo mal escrito abortaría la transacción con el recorrido
 * entero ya escrito.
 *
 * Y que el almacén salga de la SESIÓN: la entrada no lo lleva, a propósito.
 */

const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const ZONA = 'z1111111-1111-4111-8111-111111111111';
const OTRA_ZONA = 'z2222222-2222-4222-8222-222222222222';
const INSUMO = 'i1111111-1111-4111-8111-111111111111';
const AJENO = 'i2222222-2222-4222-8222-222222222222';
const AHORA = new Date('2026-09-19T17:00:00.000Z');
const CONTADO_ANTES = new Date('2026-09-01T17:00:00.000Z');

/** LA CLAVE de `motivos_merma`, no su etiqueta: la columna tiene foránea. */
const MOTIVO = 'ajuste_conteo';

function tienda(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    almacenes: [
      {
        id: ALMACEN,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        principal: true,
        activo: true,
      },
    ],
    zonas_anaquel: [
      {
        id: ZONA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        nombre: 'Reja de refrescos',
        orden: 1,
        dias_entre_conteos: 7,
        ultimo_conteo_en: CONTADO_ANTES,
        activa: true,
      },
    ],
    insumos: [
      { id: INSUMO, organizacion_id: ORG, unidad_base: 'pieza', zona_id: ZONA, activo: true },
      { id: AJENO, organizacion_id: ORG, unidad_base: 'pieza', zona_id: OTRA_ZONA, activo: true },
    ],
    motivos_merma: [
      {
        clave: MOTIVO,
        etiqueta: 'Diferencia de conteo físico',
        giro: null,
        imputable: false,
        activo: true,
      },
    ],
    existencias: [
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: INSUMO, cantidad: '240.0000' },
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: AJENO, cantidad: '10.0000' },
    ],
    tomas_inventario: [],
    toma_conteos: [],
    movimientos_stock: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(tienda(extra), {
    // Lo que contesta el `update ... returning cantidad` de `aplicarAjuste`.
    filasCrudas: [{ cantidad: '216.0000' }],
    predeterminados: {
      tomas_inventario: { zona_id: null, cerrada_en: null, empleado_id: null },
      toma_conteos: { capturas: '[]', movimiento_ajuste_id: null, empleado_id: null },
      movimientos_stock: {
        costo_unitario_centavos: 0n,
        referencia_tipo: null,
        referencia_id: null,
        empleado_id: null,
        motivo: null,
        nota: null,
        idempotency_key: null,
        sesion_caja_id: null,
      },
    },
  });

describe('inventario.ajustar_conteo', () => {
  it('UN VIAJE: sella el esperado, ajusta como MOVIMIENTO y cierra la toma', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await ajustarConteo.ejecutar(ctx, {
      zona: 'Reja de refrescos',
      movimientos: [{ insumoId: INSUMO, contado: '216' }],
      motivo: MOTIVO,
      nota: 'Diferencia de conteo físico',
    });

    expect(salida.contados).toBe(1);
    expect(salida.ajustados).toBe(1);
    expect(salida.faltantes).toBe(1);

    // El esperado se congela al contar: es lo que hace que contar con la tienda
    // abierta signifique algo.
    expect(base.campo('toma_conteos', 'esperado')).toBe('240.0000');
    expect(base.campo('toma_conteos', 'contado')).toBe('216');

    // El ajuste es un MOVIMIENTO con su motivo, no un update a la existencia:
    // sin renglón, el saldo cambia sin nada que lo explique.
    expect(base.filas('movimientos_stock')).toHaveLength(1);
    expect(base.campo('movimientos_stock', 'tipo')).toBe('ajuste');
    expect(base.campo('movimientos_stock', 'motivo')).toBe(MOTIVO);
    expect(base.campo('movimientos_stock', 'referencia_tipo')).toBe('conteo');

    expect(base.campo('tomas_inventario', 'estado')).toBe('cerrada');
    // Y el sello: sin él, mañana vuelve a tocar el mismo anaquel.
    expect(base.campo('zonas_anaquel', 'ultimo_conteo_en')).toEqual(AHORA);
  });

  it('LO QUE CUADRÓ no genera movimiento, y la zona se cierra igual', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const salida = await ajustarConteo.ejecutar(ctx, {
      zona: 'Reja de refrescos',
      movimientos: [{ insumoId: INSUMO, contado: '240.0000' }],
      motivo: MOTIVO,
      nota: null,
    });

    expect(salida.ajustados).toBe(0);
    expect(base.filas('movimientos_stock')).toEqual([]);
    // Pero queda constancia de que se contó y cuadró: es la mitad del valor de
    // un conteo cíclico.
    expect(base.filas('toma_conteos')).toHaveLength(1);
    expect(base.campo('tomas_inventario', 'estado')).toBe('cerrada');
  });

  it('UN INSUMO DE OTRA ZONA no se ajusta: la lista es de otro recorrido', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await ajustarConteo
      .ejecutar(ctx, {
        zona: 'Reja de refrescos',
        movimientos: [
          { insumoId: INSUMO, contado: '216' },
          { insumoId: AJENO, contado: '5' },
        ],
        motivo: MOTIVO,
        nota: null,
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('INVENTARIO_INVALIDO');
    // Y NADA se escribió: ni la toma del renglón bueno.
    expect(base.filas('tomas_inventario')).toEqual([]);
    expect(base.filas('toma_conteos')).toEqual([]);
    expect(base.filas('movimientos_stock')).toEqual([]);
  });

  it('UNA ZONA QUE NO EXISTE con ese nombre no abre ninguna toma', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await ajustarConteo
      .ejecutar(ctx, {
        zona: 'Congelador',
        movimientos: [{ insumoId: INSUMO, contado: '216' }],
        motivo: MOTIVO,
        nota: null,
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('PUENTE_NO_ENCONTRADO');
    expect(base.filas('tomas_inventario')).toEqual([]);
  });

  it('EL MOTIVO SE COMPRUEBA ANTES de abrir la toma', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await ajustarConteo
      .ejecutar(ctx, {
        zona: 'Reja de refrescos',
        movimientos: [{ insumoId: INSUMO, contado: '216' }],
        // La ETIQUETA en vez de la clave: es lo que la pantalla mandaba, y lo que
        // la foránea de la 062 rechaza con un `23503`.
        motivo: 'diferencia de conteo',
        nota: null,
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('CONFIGURACION_INVALIDA');
    // Ni la toma: comprobar después dejaría el recorrido entero escrito y
    // abortado.
    expect(base.filas('tomas_inventario')).toEqual([]);
  });

  it('UNA ZONA APAGADA no se cuenta', async () => {
    const base = baseDe({
      zonas_anaquel: [
        {
          id: ZONA,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          nombre: 'Reja de refrescos',
          orden: 1,
          dias_entre_conteos: 7,
          ultimo_conteo_en: CONTADO_ANTES,
          activa: false,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await ajustarConteo
      .ejecutar(ctx, {
        zona: 'Reja de refrescos',
        movimientos: [{ insumoId: INSUMO, contado: '216' }],
        motivo: MOTIVO,
        nota: null,
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('INVENTARIO_INVALIDO');
    expect(base.filas('tomas_inventario')).toEqual([]);
  });

  it('SIN ALMACÉN EN LA SUCURSAL lo dice, en vez de escribir en otro', async () => {
    const base = baseDe({ almacenes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const fallo = await ajustarConteo
      .ejecutar(ctx, {
        zona: 'Reja de refrescos',
        movimientos: [{ insumoId: INSUMO, contado: '216' }],
        motivo: MOTIVO,
        nota: null,
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('CONFIGURACION_INVALIDA');
  });
});
