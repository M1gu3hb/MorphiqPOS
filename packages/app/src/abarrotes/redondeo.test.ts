import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SESION_CAJA, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { registrarRedondeo } from './redondeo.ts';

/**
 * F-257 · «No tengo cambio, ¿le doy un chicle?»
 *
 * Pasa veinte veces al día y hoy no existe en ningún sitio: el chicle sale del
 * anaquel sin registro y el cajón descuadra por pesos sueltos que a fin de mes
 * son cientos. Lo que se prueba aquí es que quede renglón de las dos cosas —el
 * dinero y el producto— y que el redondeo no pueda crecer hasta ser un
 * descuento.
 */

const ORDEN = 'o1111111-1111-4111-8111-111111111111';
const CHICLE = 'p1111111-1111-4111-8111-111111111111';
const INSUMO_CHICLE = 'i1111111-1111-4111-8111-111111111111';
const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const OTRA_SESION = 's9999999-9999-4999-8999-999999999999';
const AHORA = new Date('2026-09-15T20:00:00.000Z');

function tienda(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    ordenes: [{ id: ORDEN, organizacion_id: ORG, estado: 'cobrada', sesion_caja_id: SESION_CAJA }],
    sesiones_caja: [
      {
        id: SESION_CAJA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        terminal_id: TERMINAL,
        estado: 'abierta',
      },
    ],
    almacenes: [
      { id: ALMACEN, organizacion_id: ORG, sucursal_id: SUCURSAL, activo: true, principal: true },
    ],
    insumos: [
      {
        id: INSUMO_CHICLE,
        organizacion_id: ORG,
        producto_id: CHICLE,
        unidad_base: 'pieza',
        activo: true,
      },
    ],
    redondeos: [],
    movimientos_caja: [],
    movimientos_stock: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(tienda(extra), {
    predeterminados: {
      redondeos: {
        producto_especie_id: null,
        movimiento_stock_id: null,
        movimiento_caja_id: null,
        empleado_id: null,
      },
      movimientos_caja: { referencia_tipo: null, referencia_id: null, motivo: null },
      movimientos_stock: {
        costo_unitario_centavos: 0n,
        referencia_tipo: null,
        referencia_id: null,
        empleado_id: null,
        motivo: null,
        idempotency_key: null,
        sesion_caja_id: null,
      },
    },
  });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('venta.registrar_redondeo', () => {
  it('EL GEMELO DE CAJA ES LA EXPLICACIÓN del descuadre', async () => {
    // La orden dice que se cobraron $47.30 y en el cajón hay $47.50. Sin esta
    // fila el corte ve los veinte centavos y no puede decir de dónde salieron.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarRedondeo.ejecutar(ctx, {
      ordenId: ORDEN,
      tipo: 'a_favor',
      importeCentavos: 20,
    });

    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(20n);
    expect(base.campo('movimientos_caja', 'tipo')).toBe('ajuste');
    expect(base.campo('movimientos_caja', 'referencia_id')).toBe(salida.redondeoId);
    expect(base.campo('redondeos', 'movimiento_caja_id')).toBe(salida.movimientoCajaId);
  });

  it('EL SIGNO LO PONE EL SERVIDOR: `en_contra` resta', async () => {
    // Aceptarlo de la pantalla dejaría mandar un `a_favor` negativo, que en el
    // corte resta lo que el cajón tiene de más.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarRedondeo.ejecutar(ctx, {
      ordenId: ORDEN,
      tipo: 'en_contra',
      importeCentavos: 30,
    });

    expect(salida.importeCentavos).toBe('-30');
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(-30n);
  });

  it('EL CHICLE SALE DEL ANAQUEL', async () => {
    // Darlo sin descontarlo hace que el inventario diga que está ahí, y el día
    // del conteo aparece como faltante sin causa.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await registrarRedondeo.ejecutar(ctx, {
      ordenId: ORDEN,
      tipo: 'especie',
      importeCentavos: 20,
      productoEspecieId: CHICLE,
    });

    expect(base.campo('movimientos_stock', 'cantidad')).toBe('-1.0000');
    // NO es venta: nadie lo pagó. En `salida_venta` inflaría el ticket con un
    // producto que se regaló.
    expect(base.campo('movimientos_stock', 'tipo')).toBe('salida_consumo_interno');
    expect(base.campo('movimientos_stock', 'referencia_id')).toBe(salida.redondeoId);
    expect(base.campo('redondeos', 'movimiento_stock_id')).toBe(
      base.campo('movimientos_stock', 'id'),
    );
  });

  it('UN ESPECIE SIN PRODUCTO se disfraza de chicle', async () => {
    // El cajón cuadra y el anaquel no: es el descuadre que esto viene a cerrar,
    // con otro nombre.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        registrarRedondeo.ejecutar(ctx, { ordenId: ORDEN, tipo: 'especie', importeCentavos: 20 }),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('redondeos')).toEqual([]);
  });

  it('UN SEGUNDO REDONDEO SOBRE EL MISMO TICKET, NO', async () => {
    // Es la forma corta de convertir el redondeo en un descuento repetible de
    // un peso en un peso.
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    await registrarRedondeo.ejecutar(uno.ctx, {
      ordenId: ORDEN,
      tipo: 'a_favor',
      importeCentavos: 20,
    });

    const dos = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    expect(
      await codigoDe(() =>
        registrarRedondeo.ejecutar(dos.ctx, {
          ordenId: ORDEN,
          tipo: 'a_favor',
          importeCentavos: 20,
        }),
      ),
    ).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('redondeos')).toHaveLength(1);
  });

  it('EL TURNO ES EL DE LA VENTA, no el de la terminal', async () => {
    // Un redondeo se teclea segundos después del cobro, y en el cambio de turno
    // esos segundos caen del otro lado: iría al turno de quien no cobró.
    const base = baseDe({
      ordenes: [
        { id: ORDEN, organizacion_id: ORG, estado: 'cobrada', sesion_caja_id: OTRA_SESION },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarRedondeo.ejecutar(ctx, {
      ordenId: ORDEN,
      tipo: 'a_favor',
      importeCentavos: 20,
    });

    expect(base.campo('redondeos', 'sesion_caja_id')).toBe(OTRA_SESION);
    expect(base.campo('movimientos_caja', 'sesion_caja_id')).toBe(OTRA_SESION);
  });

  it('SIN VENTA NO HAY REDONDEO', async () => {
    const base = baseDe({ ordenes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        registrarRedondeo.ejecutar(ctx, { ordenId: ORDEN, tipo: 'a_favor', importeCentavos: 20 }),
      ),
    ).toBe('ORDEN_NO_ENCONTRADA');
  });

  it('SIN CAJA ABIERTA y sin turno en la venta, no se registra', async () => {
    const base = baseDe({
      ordenes: [{ id: ORDEN, organizacion_id: ORG, estado: 'cobrada', sesion_caja_id: null }],
      sesiones_caja: [],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(() =>
        registrarRedondeo.ejecutar(ctx, { ordenId: ORDEN, tipo: 'a_favor', importeCentavos: 20 }),
      ),
    ).toBe('CAJA_CERRADA');
  });

  it('un producto sin insumo no descuenta nada, y el redondeo se registra igual', async () => {
    // El dinero sí pasó. No registrarlo por no poder descontar dejaría el
    // descuadre que esto viene a cerrar.
    const base = baseDe({ insumos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await registrarRedondeo.ejecutar(ctx, {
      ordenId: ORDEN,
      tipo: 'especie',
      importeCentavos: 20,
      productoEspecieId: CHICLE,
    });

    expect(base.filas('movimientos_stock')).toEqual([]);
    expect(base.filas('redondeos')).toHaveLength(1);
    expect(base.campo('redondeos', 'movimiento_stock_id')).toBeNull();
  });
});
