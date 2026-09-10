import 'server-only';

import type { Transaccion, repoVentaCatalogo } from '@morphiqpos/data';

/**
 * El catálogo visto por la comanda.
 *
 * Vive aparte de `datos.ts` porque es otra cosa: allí están las lecturas de la
 * ORDEN y la MESA, que son el estado de la venta; aquí la del PRODUCTO, que es
 * catálogo. Separarlas deja los dos archivos por debajo del límite de tamaño y,
 * sobre todo, deja claro que la guarda de flujo de `ordenDeMesa` acota el
 * estado de la venta, no lo que se puede vender.
 */

/**
 * El producto con todo lo que la comanda necesita, en UNA consulta.
 *
 * Extiende el contrato de precio del carril A —para poder pasárselo tal cual a
 * `valorarLinea` y que el precio lo calcule el mismo código que en mostrador—
 * y le añade lo que el restaurante necesita: el área, la estación heredada de
 * la categoría y el insumo base con su nombre para la instantánea del ticket.
 *
 * Una sola consulta con `in` y no una por línea: pedir producto por producto es
 * el N+1 que `morphiq-prs §12A` marca como bloqueante, y una comanda de doce
 * platos son doce viajes dentro de la transacción del pedido.
 */
export interface ProductoDeComanda extends repoVentaCatalogo.ProductoParaVender {
  readonly areaPreparacion: string;
  readonly estacionDeCategoriaId: string | null;
  readonly nombrePorcion: string | null;
  readonly insumoBaseId: string | null;
  readonly insumoBaseNombre: string | null;
}

export async function productosDeComanda(
  tx: Transaccion,
  organizacionId: string,
  productoIds: readonly string[],
): Promise<ReadonlyMap<string, ProductoDeComanda>> {
  if (productoIds.length === 0) return new Map();

  const filas = await tx
    .selectFrom('productos as p')
    .leftJoin('categorias as c', (join) =>
      join
        .onRef('c.id', '=', 'p.categoria_id')
        .onRef('c.organizacion_id', '=', 'p.organizacion_id'),
    )
    // El insumo que ESTE producto es (`insumos.producto_id`), igual que
    // `repoVentaCatalogo.productoParaVender`: un servicio no tiene y se vende igual.
    .leftJoin('insumos as i', (join) =>
      join.onRef('i.producto_id', '=', 'p.id').onRef('i.organizacion_id', '=', 'p.organizacion_id'),
    )
    .leftJoin('insumos as ib', (join) =>
      join
        .onRef('ib.id', '=', 'p.insumo_base_id')
        .onRef('ib.organizacion_id', '=', 'p.organizacion_id'),
    )
    .select([
      'p.id as id',
      'p.nombre as nombre',
      'p.sku as sku',
      'p.codigo_barras as codigoBarras',
      'p.tipo_venta as tipoVenta',
      'p.unidad_venta as unidadVenta',
      'p.precio_venta_centavos as precioVentaCentavos',
      'p.costo_unitario_centavos as costoUnitarioCentavos',
      'p.precio_mayoreo_centavos as precioMayoreoCentavos',
      'p.cantidad_minima_mayoreo as cantidadMinimaMayoreo',
      'p.unidad_variable as unidadVariable',
      'p.precio_por_unidad_variable_centavos as precioPorUnidadVariableCentavos',
      'p.cantidad_minima_variable as cantidadMinimaVariable',
      'p.cantidad_maxima_variable as cantidadMaximaVariable',
      'p.incremento_variable as incrementoVariable',
      'p.capacidad_contenedor_ml as capacidadContenedorMl',
      'p.ml_por_porcion as mlPorPorcion',
      'p.porciones_por_contenedor as porcionesPorContenedor',
      'p.precio_por_porcion_centavos as precioPorPorcionCentavos',
      'p.nombre_porcion as nombrePorcion',
      'p.estrategia_consumo as estrategiaConsumo',
      'p.permite_venta_sin_stock as permiteVentaSinStock',
      'p.area_preparacion as areaPreparacion',
      'c.estacion_preparacion_id as estacionDeCategoriaId',
      'p.insumo_base_id as insumoBaseId',
      'ib.nombre as insumoBaseNombre',
      'i.id as insumoId',
      'i.unidad_base as unidadBaseInsumo',
    ])
    .where('p.organizacion_id', '=', organizacionId)
    .where('p.id', 'in', [...productoIds])
    .where('p.activo', '=', true)
    .execute();

  return new Map(filas.map((fila) => [fila.id, fila]));
}
