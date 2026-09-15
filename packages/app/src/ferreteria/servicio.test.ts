import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { registrarServicio } from './servicio.ts';

/**
 * F-258 · El servicio de mostrador.
 *
 * Copia de llave, entonado, corte a medida. Del 4 % al 8 % de la venta con
 * márgenes del 60 % al 80 %, y hoy no está en ningún reporte de ningún sistema
 * del segmento: se cobra suelto, el material sale sin renglón, y el margen del
 * negocio se reporta más bajo de lo que es.
 */

const LLAVE_BRUTA = 'p1111111-1111-4111-8111-111111111111';
const INSUMO_LLAVE = 'i1111111-1111-4111-8111-111111111111';
const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const LINEA = 'l1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-15T16:00:00.000Z');

function ferreteria(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    insumos: [
      {
        id: INSUMO_LLAVE,
        organizacion_id: ORG,
        producto_id: LLAVE_BRUTA,
        unidad_base: 'pieza',
        activo: true,
      },
    ],
    existencias: [
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: INSUMO_LLAVE, cantidad: '40' },
    ],
    movimientos_stock: [],
    servicios_mostrador: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}, crudas?: readonly Record<string, unknown>[]) =>
  crearBaseFalsa(ferreteria(extra), {
    filasCrudas: crudas ?? [{ cantidad: '39' }],
    predeterminados: {
      movimientos_stock: {
        costo_unitario_centavos: 0n,
        referencia_tipo: null,
        referencia_id: null,
        empleado_id: null,
        motivo: null,
        idempotency_key: null,
        sesion_caja_id: null,
      },
      servicios_mostrador: { empleado_id: null },
    },
  });

const servicio = (extra: Record<string, unknown> = {}) => ({
  ordenLineaId: LINEA,
  almacenId: ALMACEN,
  tipo: 'copia_llave' as const,
  manoObraCentavos: 2_500,
  parametros: { modelo: 'Yale 5' },
  consumos: [{ productoId: LLAVE_BRUTA, cantidadBase: '1' }],
  ...extra,
});

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('venta.registrar_servicio', () => {
  it('LA MANO DE OBRA VA SEPARADA del material', async () => {
    // Son dos cosas con dos márgenes. Sumarlas escondería justo el dato que
    // esta función viene a sacar a la luz.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarServicio.ejecutar(ctx, servicio());

    expect(salida.manoObraCentavos).toBe('2500');
    expect(base.campo('servicios_mostrador', 'mano_obra_centavos')).toBe(2_500n);
  });

  it('EL MATERIAL SALE COMO `consumo_servicio`, no como venta', async () => {
    // No se vendió esa llave en bruto: se usó para hacer una copia. En
    // `salida_venta` mezclaría el costo del servicio con el de mostrador, y los
    // dos márgenes dejarían de poderse separar.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarServicio.ejecutar(ctx, servicio());

    expect(base.campo('movimientos_stock', 'tipo')).toBe('consumo_servicio');
    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-1');
    expect(base.campo('movimientos_stock', 'referencia_tipo')).toBe('servicio');
    expect(base.campo('movimientos_stock', 'referencia_id')).toBe(LINEA);
  });

  it('EL CONSUMO GUARDA SU MOVIMIENTO: el índice apunta al ledger', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarServicio.ejecutar(ctx, servicio());

    expect(salida.consumos[0]?.movimientoStockId).toBe(base.campo('movimientos_stock', 'id'));
    const indice: unknown = JSON.parse(String(base.campo('servicios_mostrador', 'consumos')));
    expect(indice).toEqual([
      {
        productoId: LLAVE_BRUTA,
        cantidadBase: '1',
        movimientoStockId: base.campo('movimientos_stock', 'id'),
      },
    ]);
  });

  it('LOS PARÁMETROS SE GUARDAN: el cliente vuelve por «otra igual»', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarServicio.ejecutar(ctx, servicio());

    const parametros: unknown = JSON.parse(String(base.campo('servicios_mostrador', 'parametros')));
    expect(parametros).toEqual({ modelo: 'Yale 5' });
  });

  it('UN SERVICIO POR PARTIDA', async () => {
    // Dos son dos manos de obra cobradas una sola vez, y dos veces el material
    // fuera del almacén.
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    await registrarServicio.ejecutar(uno.ctx, servicio());

    const dos = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    expect(await codigoDe(() => registrarServicio.ejecutar(dos.ctx, servicio()))).toBe(
      'CONFIGURACION_CONFLICTO',
    );
    expect(base.filas('movimientos_stock')).toHaveLength(1);
  });

  it('UN SERVICIO SIN MATERIAL es legítimo', async () => {
    // Una cuerda a tubo no consume nada: es mano de obra pura, y es el caso con
    // mejor margen del giro.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarServicio.ejecutar(
      ctx,
      servicio({ tipo: 'cuerda_tubo', consumos: [] }),
    );

    expect(salida.consumos).toEqual([]);
    expect(base.filas('movimientos_stock')).toEqual([]);
    expect(base.filas('servicios_mostrador')).toHaveLength(1);
  });

  it('SIN MATERIAL SUFICIENTE no se hace el servicio', async () => {
    const base = baseDe({}, []);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => registrarServicio.ejecutar(ctx, servicio()))).toBe(
      'STOCK_INSUFICIENTE',
    );
    expect(base.filas('servicios_mostrador')).toEqual([]);
  });

  it('un material que no lleva existencia', async () => {
    const base = baseDe({ insumos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => registrarServicio.ejecutar(ctx, servicio()))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });
});
