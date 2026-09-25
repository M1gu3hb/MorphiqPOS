import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { crearBaseFalsa, type TablasFalsas } from '../restaurante/pruebas/base-falsa.ts';
import { ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { apartarAnticipado, menuAnticipable } from './anticipado.ts';

/**
 * C.14 de la etapa 2.4 · El pedido anticipado de la cafetería, sin sesión y sin pago:
 * «se reserva sin pago y se cobra al recoger».
 */

const AHORA = new Date('2026-09-25T13:00:00.000Z');
const EN_MEDIA_HORA = new Date(AHORA.getTime() + 30 * 60_000).toISOString();
const LATTE = 'b1000000-0000-4000-8000-000000000001';
const OCULTO = 'b1000000-0000-4000-8000-000000000002';
const AGOTADO = 'b1000000-0000-4000-8000-000000000003';
const NEGOCIO = { organizacionId: ORG, sucursalId: SUCURSAL };

function producto(id: string, nombre: string, cambios: Record<string, unknown> = {}) {
  return {
    id,
    organizacion_id: ORG,
    nombre,
    familia: 'bebida',
    sku: null,
    codigo_barras: null,
    tipo_venta: 'unidad',
    unidad_venta: 'pieza',
    precio_venta_centavos: 6_500n,
    costo_unitario_centavos: 1_800n,
    precio_mayoreo_centavos: null,
    cantidad_minima_mayoreo: null,
    unidad_variable: null,
    precio_por_unidad_variable_centavos: null,
    cantidad_minima_variable: null,
    cantidad_maxima_variable: null,
    incremento_variable: null,
    capacidad_contenedor_ml: null,
    ml_por_porcion: null,
    porciones_por_contenedor: null,
    precio_por_porcion_centavos: null,
    estrategia_consumo: 'receta',
    permite_venta_sin_stock: true,
    categoria_id: null,
    area_preparacion: 'barra',
    activo: true,
    visible_en_menu_digital: true,
    visible_en_pos: true,
    ...cambios,
  };
}

function cafeteria(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    productos: [
      producto(LATTE, 'Latte'),
      producto(OCULTO, 'Especial de la casa', { visible_en_menu_digital: false }),
      producto(AGOTADO, 'Frappé', { visible_en_pos: false }),
    ],
    ordenes: [],
    orden_lineas: [],
    pedidos_anticipados: [],
    configuracion: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(cafeteria(extra), {
    predeterminados: {
      orden_lineas: { descuento_centavos: 0n, cantidad: '1' },
      ordenes: { total_centavos: 0n },
    },
  });

const apartado = (cambios: Record<string, unknown> = {}) => ({
  nombre: 'Ana',
  horaPrometida: EN_MEDIA_HORA,
  items: [{ productoId: LATTE, cantidad: 2 }],
  ...cambios,
});

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('el pedido anticipado público', () => {
  it('SE APARTA SIN PAGO: orden confirmada, al precio del catálogo, y su pedido programado', async () => {
    const base = baseDe();

    const salida = await apartarAnticipado(base.tx, NEGOCIO, apartado(), AHORA, 'clave-1');

    expect(base.campo('ordenes', 'estado')).toBe('confirmada');
    expect(base.campo('ordenes', 'canal')).toBe('anticipado');
    expect(base.campo('ordenes', 'nombre_pedido')).toBe('Ana');
    // Dos lattes de $65: el precio lo pone el catálogo, la entrada no trae importes.
    expect(base.campo('orden_lineas', 'precio_unitario_centavos')).toBe(6_500n);
    expect(salida.totalCentavos).toBe('13000');
    expect(base.campo('pedidos_anticipados', 'estado')).toBe('programado');
    expect(base.campo('pedidos_anticipados', 'orden_id')).toBe(salida.ordenId);
    // Sin pago: no hay fila en `pagos`.
    expect(base.filas('pagos')).toEqual([]);
  });

  it('EL DOBLE TOQUE devuelve EL MISMO apartado', async () => {
    const base = baseDe();
    const uno = await apartarAnticipado(base.tx, NEGOCIO, apartado(), AHORA, 'clave-1');
    const dos = await apartarAnticipado(base.tx, NEGOCIO, apartado(), AHORA, 'clave-1');

    expect(dos.pedidoId).toBe(uno.pedidoId);
    expect(base.filas('ordenes')).toHaveLength(1);
    expect(base.filas('pedidos_anticipados')).toHaveLength(1);
  });

  it('LO QUE NO ESTÁ EN EL MENÚ DIGITAL no se pide por identificador', async () => {
    const base = baseDe();
    expect(
      await codigoDe(() =>
        apartarAnticipado(
          base.tx,
          NEGOCIO,
          apartado({ items: [{ productoId: OCULTO, cantidad: 1 }] }),
          AHORA,
          null,
        ),
      ),
    ).toBe('PRODUCTO_NO_ENCONTRADO');
    expect(base.filas('ordenes')).toEqual([]);
  });

  it('LO QUE HOY NO HAY no se aparta', async () => {
    const base = baseDe();
    expect(
      await codigoDe(() =>
        apartarAnticipado(
          base.tx,
          NEGOCIO,
          apartado({ items: [{ productoId: AGOTADO, cantidad: 1 }] }),
          AHORA,
          null,
        ),
      ),
    ).toBe('PRODUCTO_NO_ENCONTRADO');
  });

  it('PARA DENTRO DE CINCO MINUTOS no es anticipado', async () => {
    const base = baseDe();
    const prisa = new Date(AHORA.getTime() + 5 * 60_000).toISOString();
    expect(
      await codigoDe(() =>
        apartarAnticipado(base.tx, NEGOCIO, apartado({ horaPrometida: prisa }), AHORA, null),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('EL HUECO LLENO no admite un cuarto: tres por cada cinco minutos', async () => {
    const hora = new Date(EN_MEDIA_HORA);
    const lleno = Array.from({ length: 3 }, (_, i) => ({
      id: `c1000000-0000-4000-8000-00000000000${String(i)}`,
      organizacion_id: ORG,
      sucursal_id: SUCURSAL,
      estado: 'programado',
      hora_prometida: hora,
    }));
    const base = baseDe({ pedidos_anticipados: lleno });
    expect(await codigoDe(() => apartarAnticipado(base.tx, NEGOCIO, apartado(), AHORA, null))).toBe(
      'CONFIGURACION_CONFLICTO',
    );
  });
});

describe('el menú que se puede apartar', () => {
  it('sólo lo del menú digital, con su precio y si hoy hay', async () => {
    const base = baseDe();
    const menu = await menuAnticipable(base.tx, ORG);
    expect(menu.map((p) => [p.nombre, p.precioCentavos, p.disponible])).toEqual([
      ['Frappé', '6500', false],
      ['Latte', '6500', true],
    ]);
  });
});
