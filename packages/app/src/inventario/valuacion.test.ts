import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { tomarValuacion } from './valuacion.ts';

/**
 * F-108 · El corte de valuación.
 *
 * ── Qué defiende esta prueba ───────────────────────────────────────────────
 * Que la foto se GUARDE con su detalle. Un total sin detalle es un número que
 * nadie puede auditar: el primer desacuerdo —«no puede ser, si acabo de vender
 * casi todo»— lo vuelve inútil, y entonces deja de mirarse.
 */

const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const OTRO_ALMACEN = 'a2222222-2222-4222-8222-222222222222';
const INSUMO_A = 'b1111111-1111-4111-8111-111111111111';
const INSUMO_B = 'b2222222-2222-4222-8222-222222222222';
const AHORA = new Date('2026-09-15T20:00:00.000Z');
const ANTEAYER = new Date('2026-09-13T20:00:00.000Z');
const HACE_UN_ANO = new Date('2025-09-13T20:00:00.000Z');

/**
 * La base falsa ignora los `join` y resuelve sobre UNA tabla, así que las
 * columnas de `insumos` se siembran en la misma fila de `existencias`. Está
 * documentado en `constructor-falso.ts` y es lo que ya hacen otras pruebas.
 */
function existencia(cambios: Partial<Fila> = {}): Fila {
  return {
    organizacion_id: ORG,
    almacen_id: ALMACEN,
    insumo_id: INSUMO_A,
    cantidad: '10.0000',
    actualizado_en: ANTEAYER,
    costo_unitario_centavos: 1200n,
    activo: true,
    ...cambios,
  };
}

function baseDe(filas: readonly Fila[], extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    { existencias: filas, valuaciones_inventario: [], valuacion_lineas: [], ...extra },
    { predeterminados: { valuaciones_inventario: { almacen_id: null, empleado_id: null } } },
  );
}

describe('F-108 · tomar la foto', () => {
  it('guarda cabecera y detalle: sin detalle el total no se puede auditar', async () => {
    const base = baseDe([
      existencia({ insumo_id: INSUMO_A, cantidad: '10.0000', costo_unitario_centavos: 1200n }),
      existencia({ insumo_id: INSUMO_B, cantidad: '4.0000', costo_unitario_centavos: 500n }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await tomarValuacion.ejecutar(ctx, {
      metodo: 'promedio',
      umbralDias: 180,
    });

    expect(salida.valorCentavos).toBe(String(12_000 + 2000));
    expect(salida.articulos).toBe(2);
    expect(base.campo('valuaciones_inventario', 'valor_centavos')).toBe(14_000n);
    expect(base.filas('valuacion_lineas')).toHaveLength(2);
  });

  it('separa el dinero DORMIDO, que es la mitad que dispara la decisión', async () => {
    const base = baseDe([
      existencia({ insumo_id: INSUMO_A, actualizado_en: ANTEAYER }),
      existencia({
        insumo_id: INSUMO_B,
        cantidad: '20.0000',
        costo_unitario_centavos: 900n,
        actualizado_en: HACE_UN_ANO,
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await tomarValuacion.ejecutar(ctx, { metodo: 'promedio', umbralDias: 180 });

    // «Cuánto vale» es contabilidad. «Cuánto llevo dormido» es la decisión de
    // rematar, que es la que hoy no se puede tomar.
    expect(salida.valorDormidoCentavos).toBe('18000');
  });

  it('valúa sólo el almacén pedido cuando se pide uno', async () => {
    const base = baseDe([
      existencia({ almacen_id: ALMACEN }),
      existencia({ insumo_id: INSUMO_B, almacen_id: OTRO_ALMACEN, cantidad: '100.0000' }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await tomarValuacion.ejecutar(ctx, {
      almacenId: ALMACEN,
      metodo: 'promedio',
      umbralDias: 180,
    });

    expect(salida.articulos).toBe(1);
    expect(base.campo('valuaciones_inventario', 'almacen_id')).toBe(ALMACEN);
  });

  it('no valúa el inventario de otra organización', async () => {
    const base = baseDe([existencia({ organizacion_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const fallo = await tomarValuacion
      .ejecutar(ctx, { metodo: 'promedio', umbralDias: 180 })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('valuaciones_inventario')).toHaveLength(0);
  });

  it('deja fuera los insumos archivados', async () => {
    const base = baseDe([
      existencia({ insumo_id: INSUMO_A }),
      existencia({ insumo_id: INSUMO_B, activo: false, cantidad: '999.0000' }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await tomarValuacion.ejecutar(ctx, { metodo: 'promedio', umbralDias: 180 });

    expect(salida.articulos).toBe(1);
  });

  it('falla en vez de guardar una valuación vacía', async () => {
    const base = baseDe([]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const fallo = await tomarValuacion
      .ejecutar(ctx, { metodo: 'promedio', umbralDias: 180 })
      .catch((e: unknown) => e);

    // Una foto de cero pesos guardada como histórico es peor que no tener foto:
    // el día que se mire, va a parecer que el almacén se vació.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('valuaciones_inventario')).toHaveLength(0);
  });

  it('guarda el método con el que se tomó, porque no son comparables entre sí', async () => {
    const base = baseDe([existencia()]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await tomarValuacion.ejecutar(ctx, { metodo: 'peps', umbralDias: 180 });

    expect(base.campo('valuaciones_inventario', 'metodo')).toBe('peps');
  });

  it('el cajero no valúa: es el dato de costo del negocio entero', () => {
    expect([...tomarValuacion.roles]).not.toContain('cajero');
    expect([...tomarValuacion.roles]).not.toContain('almacen');
  });
});
