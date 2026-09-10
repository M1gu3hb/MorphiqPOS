import 'server-only';

import type { repoVentaCatalogo, Transaccion } from '@morphiqpos/data';

import { valorarLinea, type LineaValorada } from '../venta/valorar.ts';

/**
 * El catálogo tal como lo puede pedir un comensal.
 *
 * ── Por qué no se usa `repoVentaCatalogo.productoParaVender` ──────────────
 * Aquélla comprueba `activo` y nada más, que es lo correcto para una caja: el
 * cajero puede vender cosas que no están en el menú digital. Aquí hace falta la
 * comprobación de más —`visible_en_menu_digital`— y hace falta en el SERVIDOR:
 * sin ella, quien conozca el identificador de un producto oculto lo pide desde
 * el teléfono aunque no aparezca en la carta.
 *
 * ── Y por qué una sola consulta ───────────────────────────────────────────
 * `validarCarritoQR` (qrPedidoFlow.js:190-204) pide el producto UNO POR UNO,
 * dentro de un bucle, con un `await` por vuelta. Con veinte líneas son veinte
 * viajes; aquí es uno, con `in`. Es el N+1 que `morphiq-prs §12A` marca como
 * bloqueante, y dentro de la transacción de un comando cuesta el doble.
 */

/** Un producto listo para valorarse, más lo que decide su ruteo a cocina. */
export interface ProductoDelMenu {
  readonly id: string;
  readonly nombre: string;
  readonly tipoVenta: string;
  readonly categoriaId: string | null;
  readonly areaPreparacion: string;
  /** El contrato que `valorarLinea` sabe leer, sin inventarle campos. */
  readonly paraVender: repoVentaCatalogo.ProductoParaVender;
}

export async function cargarProductosDelMenu(
  tx: Transaccion,
  organizacionId: string,
  ids: readonly string[],
): Promise<Map<string, ProductoDelMenu>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();

  const filas = await tx
    .selectFrom('productos')
    .select([
      'id',
      'nombre',
      'sku',
      'codigo_barras',
      'tipo_venta',
      'unidad_venta',
      'precio_venta_centavos',
      'costo_unitario_centavos',
      'precio_mayoreo_centavos',
      'cantidad_minima_mayoreo',
      'unidad_variable',
      'precio_por_unidad_variable_centavos',
      'cantidad_minima_variable',
      'cantidad_maxima_variable',
      'incremento_variable',
      'capacidad_contenedor_ml',
      'ml_por_porcion',
      'porciones_por_contenedor',
      'precio_por_porcion_centavos',
      'estrategia_consumo',
      'permite_venta_sin_stock',
      'categoria_id',
      'area_preparacion',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', 'in', unicos)
    .where('activo', '=', true)
    .where('visible_en_menu_digital', '=', true)
    .execute();

  const mapa = new Map<string, ProductoDelMenu>();
  for (const fila of filas) {
    mapa.set(fila.id, {
      id: fila.id,
      nombre: fila.nombre,
      tipoVenta: fila.tipo_venta,
      categoriaId: fila.categoria_id,
      areaPreparacion: fila.area_preparacion,
      paraVender: {
        id: fila.id,
        nombre: fila.nombre,
        sku: fila.sku,
        codigoBarras: fila.codigo_barras,
        tipoVenta: fila.tipo_venta,
        unidadVenta: fila.unidad_venta,
        precioVentaCentavos: fila.precio_venta_centavos,
        costoUnitarioCentavos: fila.costo_unitario_centavos,
        precioMayoreoCentavos: fila.precio_mayoreo_centavos,
        cantidadMinimaMayoreo: fila.cantidad_minima_mayoreo,
        unidadVariable: fila.unidad_variable,
        precioPorUnidadVariableCentavos: fila.precio_por_unidad_variable_centavos,
        cantidadMinimaVariable: fila.cantidad_minima_variable,
        cantidadMaximaVariable: fila.cantidad_maxima_variable,
        incrementoVariable: fila.incremento_variable,
        capacidadContenedorMl: fila.capacidad_contenedor_ml,
        mlPorPorcion: fila.ml_por_porcion,
        porcionesPorContenedor: fila.porciones_por_contenedor,
        precioPorPorcionCentavos: fila.precio_por_porcion_centavos,
        estrategiaConsumo: fila.estrategia_consumo,
        permiteVentaSinStock: fila.permite_venta_sin_stock,
        // El insumo no se lee: enviar a cocina NO descuenta inventario (regla 5
        // de `F1-01` §3). Traerlo aquí insinuaría que sí.
        insumoId: null,
        unidadBaseInsumo: null,
      },
    });
  }
  return mapa;
}

/**
 * En qué unidad se captura este producto. La decide el SERVIDOR.
 *
 * El comensal no manda unidad, y no es un olvido: dejarle elegir «kg» en algo
 * que se vende por pieza es la vía para pedir mil gramos de un plato de 200.
 * La unidad sale del tipo de venta, que es lo que `precioDeLinea` exige:
 * `porcion_contenedor` sólo acepta `porcion`, y `variable_medida` la unidad
 * declarada en el producto.
 *
 * `valorar.ts:unidadPorOmision` devuelve `'ml'` para `porcion_contenedor`, que
 * `cantidadDeVenta` rechaza con «Captura un número entero de porciones». Por
 * eso aquí la unidad se pasa siempre explícita en vez de dejarla por omisión;
 * queda anotado en el informe, porque el arreglo va en `venta/`.
 */
export function unidadDeVenta(producto: repoVentaCatalogo.ProductoParaVender): string {
  if (producto.tipoVenta === 'porcion_contenedor') return 'porcion';
  if (producto.tipoVenta === 'variable_medida') return producto.unidadVariable ?? 'kg';
  return producto.unidadVenta;
}

/**
 * Valora una línea del pedido con el precio del CATÁLOGO.
 *
 * Es la única puerta por la que un producto del menú QR se convierte en dinero,
 * y su firma lo dice todo: recibe el producto leído de la base y la cantidad.
 * No hay parámetro por el que pueda entrar un importe del comensal.
 */
export function valorarParaPedido(
  producto: repoVentaCatalogo.ProductoParaVender,
  cantidad: string,
): LineaValorada {
  return valorarLinea(producto, cantidad, unidadDeVenta(producto));
}
