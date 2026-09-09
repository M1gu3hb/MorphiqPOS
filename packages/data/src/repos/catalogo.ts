import { sql, type Kysely, type Transaction } from 'kysely';

import type { Esquema } from '../esquema';

type Conexion = Kysely<Esquema> | Transaction<Esquema>;

export interface CursorProducto {
  readonly updatedAt: Date;
  readonly id: string;
}

export interface FiltrosProductos {
  readonly busqueda?: string;
  readonly categoriaId?: string;
  readonly cursor?: CursorProducto;
  readonly limite?: number;
}

/**
 * Consulta estable para el catálogo grande. El cursor evita que altas nuevas
 * desplacen filas entre páginas; pg_trgm tolera errores de captura en el nombre.
 */
export function construirBusquedaProductos(
  db: Conexion,
  organizacionId: string,
  filtros: FiltrosProductos,
) {
  const limite = Math.min(Math.max(filtros.limite ?? 24, 1), 50);
  let consulta = db
    .selectFrom('productos as p')
    .leftJoin('categorias as c', (union) =>
      union
        .onRef('c.id', '=', 'p.categoria_id')
        .onRef('c.organizacion_id', '=', 'p.organizacion_id'),
    )
    .select([
      'p.id',
      'p.categoria_id',
      'p.nombre',
      'p.descripcion',
      'p.imagen_url',
      'p.sku',
      'p.codigo_barras',
      'p.marca',
      'p.precio_venta_centavos',
      'p.costo_unitario_centavos',
      'p.precio_mayoreo_centavos',
      'p.cantidad_minima_mayoreo',
      'p.tipo_venta',
      'p.unidad_venta',
      'p.permite_venta_sin_stock',
      'p.stock_minimo',
      'p.visible_en_pos',
      'p.updated_at',
      'c.nombre as categoria_nombre',
    ])
    .where('p.organizacion_id', '=', organizacionId)
    .where('p.activo', '=', true);

  const busqueda = filtros.busqueda?.trim();
  if (busqueda !== undefined && busqueda.length > 0) {
    const patron = `%${busqueda}%`;
    consulta = consulta.where((expresion) =>
      expresion.or([
        sql<boolean>`${sql.ref('p.nombre')} operator(extensions.%) ${busqueda}`,
        expresion('p.nombre', 'ilike', patron),
        expresion('p.sku', 'ilike', patron),
        expresion('p.codigo_barras', 'ilike', patron),
      ]),
    );
  }
  if (filtros.categoriaId !== undefined) {
    consulta = consulta.where('p.categoria_id', '=', filtros.categoriaId);
  }
  if (filtros.cursor !== undefined) {
    const cursor = filtros.cursor;
    consulta = consulta.where((expresion) =>
      expresion.or([
        expresion('p.updated_at', '<', cursor.updatedAt),
        expresion.and([
          expresion('p.updated_at', '=', cursor.updatedAt),
          expresion('p.id', '<', cursor.id),
        ]),
      ]),
    );
  }

  return consulta
    .orderBy('p.updated_at', 'desc')
    .orderBy('p.id', 'desc')
    .limit(limite + 1);
}

export async function buscarProductos(
  db: Conexion,
  organizacionId: string,
  filtros: FiltrosProductos,
) {
  const limite = Math.min(Math.max(filtros.limite ?? 24, 1), 50);
  const filas = await construirBusquedaProductos(db, organizacionId, filtros).execute();
  const visibles = filas.slice(0, limite);
  const ultima = visibles.at(-1);

  return {
    productos: visibles,
    siguienteCursor:
      filas.length > limite && ultima !== undefined
        ? { updatedAt: ultima.updated_at, id: ultima.id }
        : null,
  };
}
