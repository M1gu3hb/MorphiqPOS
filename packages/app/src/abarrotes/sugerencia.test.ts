import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { sugerenciaDePedido } from './sugerencia.ts';

/**
 * F-107 · «¿Qué le pido a Bimbo?»
 *
 * El repartidor llega el martes a las siete y se va en diez minutos. Lo que se
 * prueba aquí es que la respuesta salga en rejas, ordenada por urgencia, y sin
 * los renglones que ya están cubiertos: una lista con el catálogo entero es la
 * lista que nadie lee de pie.
 */

const ALMACEN = 'a1111111-1111-4111-8111-111111111111';
const PROVEEDOR = 'v1111111-1111-4111-8111-111111111111';
const REFRESCO = 'i1111111-1111-4111-8111-111111111111';
const PAN = 'i2222222-2222-4222-8222-222222222222';
// 2026-09-16 es miércoles: con visita martes y viernes, faltan dos días.
const AHORA = new Date('2026-09-16T13:00:00.000Z');

const insumo = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizacion_id: ORG,
  proveedor_id: PROVEEDOR,
  nombre,
  unidad_base: 'pieza',
  stock_minimo: '50.0000',
  stock_critico: '10.0000',
  unidad_compra_default: 'reja',
  cantidad_por_compra_default: '24.0000',
  // El costo de UNA unidad base. De aquí salen el importe del pedido y el dinero
  // dormido, que es la columna que puede frenar una compra.
  costo_unitario_centavos: 1_200n,
  activo: true,
  ...extra,
});

const salida = (insumoId: string, cantidad: string, dias: number) => ({
  id: `m-${insumoId}-${String(dias)}`,
  organizacion_id: ORG,
  almacen_id: ALMACEN,
  insumo_id: insumoId,
  tipo: 'salida_venta',
  cantidad,
  created_at: new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000),
});

function tienda(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    proveedores: [{ id: PROVEEDOR, organizacion_id: ORG, nombre: 'Bimbo', dia_visita: [2, 5] }],
    insumos: [insumo(REFRESCO, 'Refresco 600ml'), insumo(PAN, 'Pan de caja')],
    existencias: [
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: REFRESCO, cantidad: '40.0000' },
      { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: PAN, cantidad: '500.0000' },
    ],
    movimientos_stock: [salida(REFRESCO, '-420.0000', 3), salida(PAN, '-10.0000', 3)],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) => crearBaseFalsa(tienda(extra));

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('compras.sugerir_pedido', () => {
  it('CONTESTA EN REJAS, no en «te queda poco»', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    // 420 en catorce días son 30 al día; faltan dos para el viernes más uno de
    // colchón: 90 de meta contra 40 que hay, son 50 → tres rejas de 24.
    const refresco = pedido.renglones.find((r) => r.insumoId === REFRESCO);
    expect(refresco?.presentacionesSugeridas).toBe(3);
    expect(refresco?.unidadCompra).toBe('reja');
  });

  it('LA RUTA DEL PROVEEDOR ES LO QUE FIJA LA COBERTURA', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    expect(pedido.diasHastaLaVisita).toBe(2);
    expect(pedido.diasDeCobertura).toBe(3);
  });

  it('SIN RUTA DECLARADA se cubre una semana, no un día', async () => {
    // Un proveedor al que se le llama por teléfono tarda más, no menos. Suponer
    // cero pediría lo justo para hoy y dejaría la tienda sin producto el jueves.
    const base = baseDe({
      proveedores: [
        { id: PROVEEDOR, organizacion_id: ORG, nombre: 'El de los huevos', dia_visita: [] },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    expect(pedido.diasHastaLaVisita).toBeNull();
    expect(pedido.diasDeCobertura).toBe(8);
  });

  it('LO YA CUBIERTO NO ENTRA A LA LISTA', async () => {
    // El pan tiene 500 y se venden menos de uno al día: con el catálogo entero
    // en la lista, nadie la lee con el repartidor en la puerta.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    expect(pedido.renglones.map((r) => r.insumoId)).toEqual([REFRESCO]);
  });

  it('LO CRÍTICO VA ARRIBA: si la lista se corta, se pidió lo que hoy se acaba', async () => {
    const base = baseDe({
      existencias: [
        { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: REFRESCO, cantidad: '40.0000' },
        { organizacion_id: ORG, almacen_id: ALMACEN, insumo_id: PAN, cantidad: '5.0000' },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    expect(pedido.renglones.map((r) => r.alerta)).toEqual(['critico', 'bajo']);
    expect(pedido.renglones[0]?.insumoId).toBe(PAN);
  });

  it('SÓLO LA VENTA PREDICE: la merma no se repone dos veces', async () => {
    // Pedir para reponer lo que se echó a perder es comprar la merma otra vez.
    const base = baseDe({
      movimientos_stock: [
        salida(REFRESCO, '-420.0000', 3),
        { ...salida(REFRESCO, '-420.0000', 2), id: 'merma', tipo: 'merma' },
        salida(PAN, '-10.0000', 3),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    expect(pedido.renglones[0]?.ventaDelPeriodoBase).toBe('420.0000');
  });

  it('LA VENTA VIEJA NO CUENTA', async () => {
    // Con la ventana abierta, un producto que se disparó hace tres meses se
    // seguiría pidiendo como entonces.
    const base = baseDe({
      movimientos_stock: [salida(REFRESCO, '-420.0000', 40), salida(PAN, '-10.0000', 3)],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    // Sin venta reciente sólo queda el piso: 50 de mínimo contra 40 que hay.
    expect(pedido.renglones[0]?.ventaDelPeriodoBase).toBe('0.0000');
    expect(pedido.renglones[0]?.faltanBase).toBe('10.0000');
  });

  it('EL LEDGER GUARDA LA SALIDA EN NEGATIVO y el ritmo no sale negativo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    expect(pedido.renglones[0]?.ventaDelPeriodoBase).toBe('420.0000');
  });

  it('SIN PRESENTACIÓN DE COMPRA se pide en unidad base', async () => {
    // Suponer una caja de doce inventaría un empaque que el proveedor no maneja.
    const base = baseDe({
      insumos: [
        insumo(REFRESCO, 'Refresco 600ml', {
          cantidad_por_compra_default: null,
          unidad_compra_default: null,
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    expect(pedido.renglones[0]?.presentacionesSugeridas).toBe(50);
    expect(pedido.renglones[0]?.unidadCompra).toBe('pieza');
  });

  it('EL IMPORTE Y EL DINERO DORMIDO salen del costo, no de la pantalla', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    const refresco = pedido.renglones.find((r) => r.insumoId === REFRESCO);
    // Tres rejas de 24 piezas a $12.00 la pieza: 3 × 24 × 1200 = 86 400 centavos.
    expect(refresco?.importeCentavos).toBe('86400');
    // Y lo dormido son las 40 que hay a $12.00: 48 000 centavos.
    expect(refresco?.dormidoCentavos).toBe('48000');
    expect(refresco?.costoUnitarioCentavos).toBe('1200');
  });

  it('LA EXISTENCIA SALE DEL ALMACÉN DE LA SESIÓN cuando no se dice cuál', async () => {
    // La pantalla de entradas no sabe en qué almacén está, y obligarla a mandarlo
    // la hacía cargar primero la lista de almacenes para contestar algo que el
    // servidor ya sabe.
    const base = baseDe({
      almacenes: [
        {
          id: ALMACEN,
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          principal: true,
          activo: true,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      diasDeVenta: 14,
    });

    // La misma respuesta que con el almacén dicho: la existencia es la de ahí.
    expect(pedido.renglones.map((r) => r.insumoId)).toEqual([REFRESCO]);
  });

  it('un proveedor de otro negocio no tiene lista', async () => {
    const base = baseDe({ proveedores: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    expect(
      await codigoDe(() =>
        sugerenciaDePedido.ejecutar(ctx, {
          proveedorId: PROVEEDOR,
          almacenId: ALMACEN,
          diasDeVenta: 14,
        }),
      ),
    ).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('un proveedor sin artículos devuelve una lista vacía, no un error', async () => {
    const base = baseDe({ insumos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('almacen'), AHORA);

    const pedido = await sugerenciaDePedido.ejecutar(ctx, {
      proveedorId: PROVEEDOR,
      almacenId: ALMACEN,
      diasDeVenta: 14,
    });

    expect(pedido.renglones).toEqual([]);
    expect(pedido.proveedor).toBe('Bimbo');
  });
});
