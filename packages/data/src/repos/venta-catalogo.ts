import 'server-only';

import type { Kysely } from 'kysely';

import type { Transaccion } from '../cliente.ts';
import type { Esquema } from '../esquema.ts';

/**
 * Lectura del catálogo para valorar una línea de venta (F1.1-A-06, A-07).
 *
 * Vive aparte de `repos/catalogo.ts` —que es del carril B y sirve a la gestión—
 * porque lo que la venta necesita es distinto: no la ficha completa del
 * producto, sino exactamente los campos que decidan su precio y su consumo de
 * inventario. Pedir columnas de más en el camino del cobro es lo que
 * `morphiq-prs §12A` prohíbe con «se evita `SELECT *`».
 */

export interface ProductoParaVender {
  readonly id: string;
  readonly nombre: string;
  readonly sku: string | null;
  readonly codigoBarras: string | null;
  readonly tipoVenta: string;
  readonly unidadVenta: string;
  readonly precioVentaCentavos: bigint;
  readonly costoUnitarioCentavos: bigint;
  readonly precioMayoreoCentavos: bigint | null;
  readonly cantidadMinimaMayoreo: string | null;
  readonly unidadVariable: string | null;
  readonly precioPorUnidadVariableCentavos: bigint | null;
  readonly cantidadMinimaVariable: string | null;
  readonly cantidadMaximaVariable: string | null;
  readonly incrementoVariable: string | null;
  readonly capacidadContenedorMl: string | null;
  readonly mlPorPorcion: string | null;
  readonly porcionesPorContenedor: string | null;
  readonly precioPorPorcionCentavos: bigint | null;
  readonly estrategiaConsumo: string;
  readonly permiteVentaSinStock: boolean;
  /** El insumo que descuenta este producto, si lo tiene. */
  readonly insumoId: string | null;
  readonly unidadBaseInsumo: string | null;
}

const COLUMNAS = [
  'productos.id as id',
  'productos.nombre as nombre',
  'productos.sku as sku',
  'productos.codigo_barras as codigoBarras',
  'productos.tipo_venta as tipoVenta',
  'productos.unidad_venta as unidadVenta',
  'productos.precio_venta_centavos as precioVentaCentavos',
  'productos.costo_unitario_centavos as costoUnitarioCentavos',
  'productos.precio_mayoreo_centavos as precioMayoreoCentavos',
  'productos.cantidad_minima_mayoreo as cantidadMinimaMayoreo',
  'productos.unidad_variable as unidadVariable',
  'productos.precio_por_unidad_variable_centavos as precioPorUnidadVariableCentavos',
  'productos.cantidad_minima_variable as cantidadMinimaVariable',
  'productos.cantidad_maxima_variable as cantidadMaximaVariable',
  'productos.incremento_variable as incrementoVariable',
  'productos.capacidad_contenedor_ml as capacidadContenedorMl',
  'productos.ml_por_porcion as mlPorPorcion',
  'productos.porciones_por_contenedor as porcionesPorContenedor',
  'productos.precio_por_porcion_centavos as precioPorPorcionCentavos',
  'productos.estrategia_consumo as estrategiaConsumo',
  'productos.permite_venta_sin_stock as permiteVentaSinStock',
  'insumos.id as insumoId',
  'insumos.unidad_base as unidadBaseInsumo',
] as const;

export async function productoParaVender(
  db: Kysely<Esquema> | Transaccion,
  organizacionId: string,
  productoId: string,
): Promise<ProductoParaVender | null> {
  const fila = await db
    .selectFrom('productos')
    // `leftJoin`: un servicio no tiene insumo y debe poder venderse igual.
    .leftJoin('insumos', 'insumos.producto_id', 'productos.id')
    .select(COLUMNAS)
    .where('productos.organizacion_id', '=', organizacionId)
    .where('productos.id', '=', productoId)
    .where('productos.activo', '=', true)
    .executeTakeFirst();

  return fila ?? null;
}

/** El almacén principal de una sucursal: de ahí sale el stock de la venta. */
export async function almacenPrincipal(
  db: Kysely<Esquema> | Transaccion,
  organizacionId: string,
  sucursalId: string,
): Promise<string | null> {
  const fila = await db
    .selectFrom('almacenes')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('sucursal_id', '=', sucursalId)
    .where('activo', '=', true)
    .orderBy('principal', 'desc')
    .executeTakeFirst();

  return fila?.id ?? null;
}

export interface ProductoDeVenta {
  readonly id: string;
  readonly nombre: string;
  readonly sku: string | null;
  readonly codigoBarras: string | null;
  readonly precioVentaCentavos: bigint;
  readonly tipoVenta: string;
  readonly unidadVenta: string;
  readonly categoriaNombre: string | null;
  readonly existencia: string | null;
}

/**
 * El catálogo que ve el cajero: lo mínimo para pintar una rejilla y buscar.
 *
 * Paginado siempre (`morphiq-prs §12A`), y la existencia sale de un `leftJoin`
 * y no de una consulta por producto — eso sería el N+1 que la misma sección
 * marca como BLOCKER.
 */
export async function catalogoDeVenta(
  db: Kysely<Esquema>,
  organizacionId: string,
  opciones: { readonly busqueda?: string; readonly almacenId?: string; readonly limite: number },
): Promise<ProductoDeVenta[]> {
  let consulta = db
    .selectFrom('productos')
    .leftJoin('categorias', 'categorias.id', 'productos.categoria_id')
    .leftJoin('insumos', 'insumos.producto_id', 'productos.id')
    .leftJoin('existencias', (join) =>
      join
        .onRef('existencias.insumo_id', '=', 'insumos.id')
        .on('existencias.almacen_id', '=', opciones.almacenId ?? null),
    )
    .select([
      'productos.id as id',
      'productos.nombre as nombre',
      'productos.sku as sku',
      'productos.codigo_barras as codigoBarras',
      'productos.precio_venta_centavos as precioVentaCentavos',
      'productos.tipo_venta as tipoVenta',
      'productos.unidad_venta as unidadVenta',
      'categorias.nombre as categoriaNombre',
      'existencias.cantidad as existencia',
    ])
    .where('productos.organizacion_id', '=', organizacionId)
    .where('productos.activo', '=', true)
    .where('productos.visible_en_pos', '=', true);

  const busqueda = opciones.busqueda?.trim();
  if (busqueda !== undefined && busqueda !== '') {
    consulta = consulta.where((eb) =>
      eb.or([
        eb('productos.nombre', 'ilike', `%${busqueda}%`),
        eb('productos.sku', 'ilike', `${busqueda}%`),
        eb('productos.codigo_barras', '=', busqueda),
      ]),
    );
  }

  return consulta.orderBy('productos.nombre').limit(opciones.limite).execute();
}

/** Búsqueda exacta por código de barras, para el escáner. */
export async function productoPorCodigo(
  db: Kysely<Esquema>,
  organizacionId: string,
  codigo: string,
): Promise<{ readonly id: string } | null> {
  const fila = await db
    .selectFrom('productos')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('codigo_barras', '=', codigo)
    .where('activo', '=', true)
    .executeTakeFirst();

  return fila ?? null;
}
