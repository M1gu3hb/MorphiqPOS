import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG, SUCURSAL, TERMINAL } from '../restaurante/pruebas/sala.ts';
import { agregarPartida } from './partida.ts';

/**
 * F-061 · La pieza de la ficha, puesta en la venta.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que la venta sea la de ESTA TERMINAL y no una que mande la pantalla: la ficha
 * no tiene ninguna orden en la mano, se llega a ella desde la búsqueda.
 *
 * Que un borrador YA ABIERTO se reutilice. El índice parcial
 * `ordenes_borrador_por_terminal` sólo admite uno, y una pieza agregada a un
 * segundo borrador es una partida que el cajero no va a cobrar.
 *
 * Y que sin terminal se diga, en vez de escribir una venta que nadie va a cobrar.
 */

const PIEZA = 'b1111111-1111-4111-8111-111111111111';
const ORDEN = 'o1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-19T17:00:00.000Z');

/**
 * La fila del producto con las columnas del `leftJoin` ya aplanadas.
 *
 * La base falsa resuelve sobre UNA tabla y las columnas de la otra se siembran en
 * la misma fila, que es lo que `productoParaVender` lee: `productos` con
 * `insumos.id as insumoId`.
 */
function piezaDeCatalogo(extra: Fila = {}): Fila {
  return {
    id: PIEZA,
    organizacion_id: ORG,
    nombre: 'Tornillo tirafondo 1/4 × 2',
    sku: 'TIR-14X2',
    codigo_barras: null,
    tipo_venta: 'precio_fijo',
    unidad_venta: 'pieza',
    precio_venta_centavos: 350n,
    costo_unitario_centavos: 180n,
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
    estrategia_consumo: 'sku',
    permite_venta_sin_stock: true,
    activo: true,
    unidad_base: 'pieza',
    ...extra,
  };
}

function baseDe(ordenes: readonly Fila[] = []) {
  return crearBaseFalsa(
    { productos: [piezaDeCatalogo()], ordenes: [...ordenes], orden_lineas: [] },
    {
      predeterminados: {
        ordenes: { estado: 'borrador', total_centavos: 0n },
        orden_lineas: {
          descuento_centavos: 0n,
          impuesto_centavos: 0n,
          notas: null,
          opciones: null,
        },
      },
    },
  );
}

const borradorAbierto = (extra: Fila = {}): Fila => ({
  id: ORDEN,
  organizacion_id: ORG,
  sucursal_id: SUCURSAL,
  terminal_id: TERMINAL,
  estado: 'borrador',
  ...extra,
});

describe('ferreteria.agregar_partida', () => {
  it('SIN VENTA ABIERTA la abre, y la partida queda en ella', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agregarPartida.ejecutar(ctx, { piezaId: PIEZA, cantidad: '3' });

    expect(salida.ventaNueva).toBe(true);
    expect(base.filas('ordenes')).toHaveLength(1);
    expect(base.campo('ordenes', 'terminal_id')).toBe(TERMINAL);
    expect(base.filas('orden_lineas')).toHaveLength(1);
    expect(base.campo('orden_lineas', 'orden_id')).toBe(base.campo('ordenes', 'id'));
    // 3 × $3.50: el precio lo pone el catálogo, nunca la pantalla.
    expect(salida.subtotalCentavos).toBe('1050');
  });

  it('CON UNA VENTA YA ABIERTA usa ésa: no hay dos borradores por terminal', async () => {
    const base = baseDe([borradorAbierto()]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agregarPartida.ejecutar(ctx, { piezaId: PIEZA, cantidad: '1' });

    expect(salida.ventaNueva).toBe(false);
    expect(salida.ordenId).toBe(ORDEN);
    expect(base.filas('ordenes')).toHaveLength(1);
    expect(base.campo('orden_lineas', 'orden_id')).toBe(ORDEN);
  });

  it('EL BORRADOR DE OTRA TERMINAL no se toca: se abre el de ésta', async () => {
    const base = baseDe([borradorAbierto({ terminal_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await agregarPartida.ejecutar(ctx, { piezaId: PIEZA, cantidad: '1' });

    expect(salida.ventaNueva).toBe(true);
    expect(salida.ordenId).not.toBe(ORDEN);
    expect(base.filas('ordenes')).toHaveLength(2);
  });

  it('UNA PIEZA DE OTRO NEGOCIO contesta como una que no existe', async () => {
    const base = crearBaseFalsa({
      productos: [piezaDeCatalogo({ organizacion_id: 'a9999999-9999-4999-8999-999999999999' })],
      ordenes: [],
      orden_lineas: [],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await agregarPartida
      .ejecutar(ctx, { piezaId: PIEZA, cantidad: '1' })
      .catch((e: unknown) => e);

    // El mismo código que una inexistente: distinguirlos permitiría sondear el
    // catálogo ajeno con identificadores.
    expect(esErrorDominio(fallo) && fallo.codigo).toBe('PRODUCTO_NO_ENCONTRADO');
    expect(base.filas('orden_lineas')).toEqual([]);
  });

  it('SIN TERMINAL no se escribe ninguna venta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, { ...ambitoDe('cajero'), terminalId: null }, AHORA);

    const fallo = await agregarPartida
      .ejecutar(ctx, { piezaId: PIEZA, cantidad: '1' })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('VENTA_SIN_TERMINAL');
    expect(base.filas('ordenes')).toEqual([]);
  });
});
