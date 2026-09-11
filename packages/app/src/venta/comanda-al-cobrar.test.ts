import { describe, expect, it } from 'vitest';

import { comandarLineasPendientes } from '../restaurante/comandar-pendientes.ts';
import { crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';

/**
 * LA VENTA DE MOSTRADOR TIENE QUE LLEGAR A LA COCINA.
 *
 * ── El defecto ─────────────────────────────────────────────────────────────
 * `POS.jsx:462` creaba un `PedidoPreparacion` por área dentro de un bucle, con
 * `.catch(() => {})` en la línea siguiente (`POS.jsx:469`). Cuando fallaba, el
 * cajero veía el cobro correcto y el ticket impreso, y en cocina no había NADA:
 * ni pedido, ni sonido. El cliente esperaba de pie hasta que preguntaba.
 *
 * Y cuando ese bucle se retiró al cablear las pantallas, quedó algo peor: NADA
 * mandaba el mostrador a la cocina. Una hamburguesa cobrada en la barra no
 * llegaba nunca a la plancha, ni siquiera de vez en cuando.
 *
 * ── Las dos mitades, y por qué las dos hacen falta ─────────────────────────
 * `comandarLineasPendientes` corre en TODO cobro. En el mostrador tiene que
 * emitir; en la MESA tiene que callarse, porque allí las comandas ya salieron
 * con `restaurante.enviar_pedido` y volver a emitirlas mandaría el pedido dos
 * veces a la plancha. Una prueba de la primera mitad sola pasaría igual con una
 * implementación que comandara siempre.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const ORDEN = '33333333-3333-4333-8333-333333333333';
const HAMBURGUESA = '44444444-4444-4444-8444-444444444444';
const REFRESCO = '55555555-5555-4555-8555-555555555555';
const ESTACION = '66666666-6666-4666-8666-666666666666';

function linea(id: string, productoId: string, visual: number, cambios: Fila = {}): Fila {
  return {
    id,
    organizacion_id: ORG,
    orden_id: ORDEN,
    producto_id: productoId,
    producto_nombre: 'x',
    cantidad: '1',
    unidad: 'pieza',
    notas: null,
    orden_visual: visual,
    estado_preparacion: 'pendiente',
    precio_unitario_centavos: 10_000n,
    total_centavos: 10_000n,
    ...cambios,
  };
}

function producto(id: string, area: string, cambios: Fila = {}): Fila {
  return {
    id,
    organizacion_id: ORG,
    nombre: area === 'cocina' ? 'Hamburguesa' : 'Refresco',
    activo: true,
    tipo_venta: 'sku',
    area_preparacion: area,
    estacion_preparacion_id: null,
    categoria_id: null,
    precio_venta_centavos: 10_000n,
    costo_unitario_centavos: 3_000n,
    unidad_base: 'pieza',
    nombre_porcion: null,
    ingrediente_base_id: null,
    ...cambios,
  };
}

const ORDEN_FILA: Fila = {
  id: ORDEN,
  organizacion_id: ORG,
  sucursal_id: SUCURSAL,
  mesa_id: null,
  estado: 'borrador',
  estrategia_captura: 'mostrador',
  codigo_caja: null,
  notas_alergias: null,
  celebracion_especial: false,
  tipo_celebracion: null,
};

const ESTACION_FILA: Fila = {
  id: ESTACION,
  organizacion_id: ORG,
  nombre: 'Cocina general',
  color: '#111111',
  es_general: true,
  activa: true,
};

function baseDe(extra: Record<string, readonly Fila[]> = {}) {
  return crearBaseFalsa({
    ordenes: [ORDEN_FILA],
    estaciones_preparacion: [ESTACION_FILA],
    orden_lineas: [linea('l1', HAMBURGUESA, 0), linea('l2', REFRESCO, 1)],
    productos: [producto(HAMBURGUESA, 'cocina'), producto(REFRESCO, '')],
    comandas: [],
    comanda_items: [],
    ...extra,
  });
}

describe('el cobro manda a la cocina lo que todavía no salió', () => {
  it('MOSTRADOR: la hamburguesa llega a la plancha, el refresco no', async () => {
    const base = baseDe();

    const emitidas = await comandarLineasPendientes(base.tx, ORG, ORDEN);

    expect(emitidas).toHaveLength(1);
    expect(emitidas[0]?.area).toBe('cocina');
    expect(emitidas[0]?.items).toBe(1);

    // Y quedó escrito, con su item apuntando a la línea de venta.
    expect(base.filas('comandas')).toHaveLength(1);
    const items = base.filas('comanda_items');
    expect(items).toHaveLength(1);
    expect(items[0]?.['orden_linea_id']).toBe('l1');
    // El refresco no se cocina: sin área, no hay comanda que emitir.
    expect(items.some((i) => i['orden_linea_id'] === 'l2')).toBe(false);
  });

  it('MESA: si las líneas YA tienen comanda, no se emite ninguna otra', async () => {
    // La otra mitad. Sin este filtro, cobrar una mesa mandaría el pedido entero
    // a la plancha por segunda vez, con la comida ya servida en el salón.
    const base = baseDe({
      comandas: [
        {
          id: 'cmd-1',
          organizacion_id: ORG,
          orden_id: ORDEN,
          mesa_id: null,
          estacion_preparacion_id: ESTACION,
          area: 'cocina',
          estado: 'listo',
          notas: null,
          estacion_nombre: 'Cocina general',
          estacion_color: '#111111',
          origen: 'mesero',
          notas_alergias: null,
          celebracion_especial: false,
          tipo_celebracion: null,
        },
      ],
      comanda_items: [
        {
          id: 'it-1',
          organizacion_id: ORG,
          comanda_id: 'cmd-1',
          orden_linea_id: 'l1',
          producto_id: HAMBURGUESA,
          producto_nombre: 'Hamburguesa',
          cantidad: '1',
          notas: null,
          estado: 'listo',
          tipo_venta: 'sku',
          unidad_variable: null,
          cantidad_variable: null,
          nombre_porcion: null,
          cantidad_porciones: null,
          orden_visual: 0,
        },
      ],
    });

    const emitidas = await comandarLineasPendientes(base.tx, ORG, ORDEN);

    expect(emitidas).toHaveLength(0);
    expect(base.filas('comandas')).toHaveLength(1);
    expect(base.filas('comanda_items')).toHaveLength(1);
  });

  it('MESA con un plato añadido después: sólo sale EL NUEVO', async () => {
    // El caso que distingue «filtrar por línea» de «filtrar por orden». Si el
    // filtro fuera «esta orden ya tiene comandas, no emitas», el plato que el
    // comensal pide al final no llegaría nunca a la cocina.
    const base = baseDe({
      orden_lineas: [
        linea('l1', HAMBURGUESA, 0),
        linea('l2', REFRESCO, 1),
        linea('l3', HAMBURGUESA, 2),
      ],
      comandas: [
        {
          id: 'cmd-1',
          organizacion_id: ORG,
          orden_id: ORDEN,
          mesa_id: null,
          estacion_preparacion_id: ESTACION,
          area: 'cocina',
          estado: 'listo',
          notas: null,
          estacion_nombre: 'Cocina general',
          estacion_color: '#111111',
          origen: 'mesero',
          notas_alergias: null,
          celebracion_especial: false,
          tipo_celebracion: null,
        },
      ],
      comanda_items: [
        {
          id: 'it-1',
          organizacion_id: ORG,
          comanda_id: 'cmd-1',
          orden_linea_id: 'l1',
          producto_id: HAMBURGUESA,
          producto_nombre: 'Hamburguesa',
          cantidad: '1',
          notas: null,
          estado: 'listo',
          tipo_venta: 'sku',
          unidad_variable: null,
          cantidad_variable: null,
          nombre_porcion: null,
          cantidad_porciones: null,
          orden_visual: 0,
        },
      ],
    });

    const emitidas = await comandarLineasPendientes(base.tx, ORG, ORDEN);

    expect(emitidas).toHaveLength(1);
    const nuevos = base.filas('comanda_items').filter((i) => i['comanda_id'] !== 'cmd-1');
    expect(nuevos).toHaveLength(1);
    expect(nuevos[0]?.['orden_linea_id']).toBe('l3');
  });

  it('una orden sin nada que preparar no crea comandas vacías', async () => {
    const base = baseDe({
      orden_lineas: [linea('l2', REFRESCO, 0)],
    });

    const emitidas = await comandarLineasPendientes(base.tx, ORG, ORDEN);

    expect(emitidas).toHaveLength(0);
    expect(base.filas('comandas')).toHaveLength(0);
  });

  it('la comanda del mostrador nace con origen «pos», no «mesero»', async () => {
    // El origen lo dice la ORDEN, no el cuerpo de la petición. Cocina lo pinta
    // para saber si el plato es de salón o de barra.
    const base = baseDe();

    await comandarLineasPendientes(base.tx, ORG, ORDEN);

    expect(base.filas('comandas')[0]?.['origen']).toBe('pos');
    expect(base.filas('comandas')[0]?.['mesa_id']).toBe(null);
  });
});
