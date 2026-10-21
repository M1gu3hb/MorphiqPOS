import { describe, expect, it } from 'vitest';

import { comandarLineasPendientes } from './comandar-pendientes.ts';
import { crearBaseFalsa, type Fila } from './pruebas/base-falsa.ts';

/**
 * COBRAR UNA PARTE DE UNA CUENTA DIVIDIDA NO MANDA OTRA VEZ LA COMIDA A LA PLANCHA.
 *
 * ── El defecto ─────────────────────────────────────────────────────────────
 * «Lo que todavía no salió» se buscaba por las comandas de la ORDEN que se cobra. Una cuenta
 * dividida mueve sus líneas a las hijas y deja sus comandas colgadas de la madre: la hija no
 * encontraba ninguna comanda y daba por pendientes TODAS sus líneas. Cobrar cada parte de una
 * mesa dividida emitía, por cada una, un pedido nuevo con lo que la mesa ya se había comido, y
 * la cocina lo veía llegar —cobrado y entregado— como si fuera para preparar. Se vio en el
 * recorrido del día completo del restaurante: dos partes cobradas, tres comandas nuevas.
 *
 * `comanda-al-cobrar.test.ts` ya prueba que el mostrador emite y que la mesa se calla; esto
 * prueba la mesa DIVIDIDA, donde las comandas son de otra orden.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const MADRE = '33333333-3333-4333-8333-333333333333';
const HIJA = '33333333-3333-4333-8333-333333333334';
const ARRACHERA = '44444444-4444-4444-8444-444444444444';
const CERVEZA = '55555555-5555-4555-8555-555555555555';
const ESTACION = '66666666-6666-4666-8666-666666666666';
const COMANDA_DE_LA_MADRE = '77777777-7777-4777-8777-777777777777';

function linea(id: string, productoId: string, visual: number): Fila {
  return {
    id,
    organizacion_id: ORG,
    orden_id: HIJA,
    producto_id: productoId,
    producto_nombre: 'x',
    cantidad: '1',
    unidad: 'pieza',
    notas: null,
    orden_visual: visual,
    estado_preparacion: 'entregado',
    precio_unitario_centavos: 10_000n,
    total_centavos: 10_000n,
    anulada_en: null,
  };
}

function producto(id: string, nombre: string, area: string): Fila {
  return {
    id,
    organizacion_id: ORG,
    nombre,
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
  };
}

/** La comanda que SALIÓ con la cuenta madre, y el item de cada línea que ya se sirvió. */
function lasComandasDeLaMadre(lineasServidas: readonly string[]) {
  return {
    comandas: [
      {
        id: COMANDA_DE_LA_MADRE,
        organizacion_id: ORG,
        orden_id: MADRE,
        mesa_id: null,
        estacion_preparacion_id: ESTACION,
        area: 'cocina',
        estado: 'entregado',
        notas: null,
        estacion_nombre: 'Cocina general',
        estacion_color: '#111111',
        origen: 'mesero',
        notas_alergias: null,
        celebracion_especial: false,
        tipo_celebracion: null,
      },
    ] satisfies Fila[],
    comanda_items: lineasServidas.map((lineaId, i): Fila => ({
      id: `it-${String(i)}`,
      organizacion_id: ORG,
      comanda_id: COMANDA_DE_LA_MADRE,
      orden_linea_id: lineaId,
      producto_nombre: 'x',
      cantidad: '1',
      estado: 'entregado',
      orden_visual: i,
    })),
  };
}

function baseDe(lineas: readonly Fila[], lineasServidas: readonly string[]) {
  return crearBaseFalsa({
    // La parte: una cuenta con su propia línea, sin ninguna comanda a su nombre.
    ordenes: [
      {
        id: HIJA,
        organizacion_id: ORG,
        sucursal_id: SUCURSAL,
        mesa_id: null,
        estado: 'cuenta_solicitada',
        estrategia_captura: 'mesa',
        codigo_caja: 'M05-4821-1',
        notas_alergias: null,
        celebracion_especial: false,
        tipo_celebracion: null,
      },
    ],
    estaciones_preparacion: [
      {
        id: ESTACION,
        organizacion_id: ORG,
        nombre: 'Cocina general',
        color: '#111111',
        es_general: true,
        activa: true,
      },
    ],
    orden_lineas: lineas,
    productos: [producto(ARRACHERA, 'Arrachera', 'cocina'), producto(CERVEZA, 'Cerveza', 'cocina')],
    ...lasComandasDeLaMadre(lineasServidas),
  });
}

describe('el cobro de una parte de una cuenta dividida', () => {
  it('NO MANDA A LA PLANCHA lo que la mesa ya se comió: sus comandas son de la madre', async () => {
    const base = baseDe([linea('l1', ARRACHERA, 0), linea('l2', CERVEZA, 1)], ['l1', 'l2']);

    const emitidas = await comandarLineasPendientes(base.tx, ORG, HIJA);

    expect(emitidas).toEqual([]);
    // Ni una comanda más que la que salió con la cuenta, ni un item más.
    expect(base.filas('comandas')).toHaveLength(1);
    expect(base.filas('comanda_items')).toHaveLength(2);
  });

  it('SE DECIDE POR LÍNEA: una línea que nunca se comandó sí sale, aunque las demás ya salieran', async () => {
    // El caso que distingue «¿esta línea ya salió?» de «¿esta orden tiene comandas?».
    const base = baseDe([linea('l1', ARRACHERA, 0), linea('l2', CERVEZA, 1)], ['l1']);

    const emitidas = await comandarLineasPendientes(base.tx, ORG, HIJA);

    expect(emitidas).toHaveLength(1);
    const nuevos = base
      .filas('comanda_items')
      .filter((i) => i['comanda_id'] !== COMANDA_DE_LA_MADRE);
    expect(nuevos.map((i) => i['orden_linea_id'])).toEqual(['l2']);
  });
});
