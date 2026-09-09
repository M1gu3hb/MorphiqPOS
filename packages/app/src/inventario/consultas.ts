import 'server-only';

import { obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';

export async function consultarInventarioProduccion(organizacionId: string) {
  const db = obtenerDb();
  const [almacenes, insumos] = await Promise.all([
    db
      .selectFrom('almacenes')
      .select(['id', 'nombre', 'principal'])
      .where('organizacion_id', '=', organizacionId)
      .where('activo', '=', true)
      .orderBy('principal', 'desc')
      .orderBy('nombre')
      .execute(),
    db
      .selectFrom('insumos as i')
      .leftJoin('existencias as e', (union) =>
        union
          .onRef('e.insumo_id', '=', 'i.id')
          .onRef('e.organizacion_id', '=', 'i.organizacion_id'),
      )
      .leftJoin('almacenes as a', 'a.id', 'e.almacen_id')
      .select([
        'i.id',
        'i.nombre',
        'i.unidad_base',
        'i.costo_unitario_centavos',
        'i.stock_minimo',
        'e.cantidad',
        'a.id as almacen_id',
        'a.nombre as almacen_nombre',
      ])
      .where('i.organizacion_id', '=', organizacionId)
      .where('i.activo', '=', true)
      .orderBy('i.nombre')
      .execute(),
  ]);
  return {
    almacenes,
    insumos: insumos.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      unidad: item.unidad_base,
      costoUnitarioCentavos: item.costo_unitario_centavos.toString(),
      stockMinimo: item.stock_minimo,
      cantidad: item.cantidad ?? '0',
      almacenId: item.almacen_id,
      almacenNombre: item.almacen_nombre,
    })),
  };
}

export async function consultarRecetasProduccion(organizacionId: string) {
  const db = obtenerDb();
  const [productos, insumos, recetas] = await Promise.all([
    sql<{
      id: string;
      nombre: string;
      precio: bigint;
      costo: bigint;
      utilidad: bigint;
      margen: bigint;
    }>`
      select id, nombre, precio_venta_centavos precio, costo_unitario_centavos costo,
             utilidad_unitaria_centavos utilidad, margen_bp margen
      from productos where organizacion_id = ${organizacionId} and activo and estrategia_consumo = 'receta'
      order by nombre
    `.execute(db),
    db
      .selectFrom('insumos')
      .select(['id', 'nombre', 'unidad_base', 'costo_unitario_centavos'])
      .where('organizacion_id', '=', organizacionId)
      .where('activo', '=', true)
      .orderBy('nombre')
      .execute(),
    sql<{
      producto_id: string;
      insumo_id: string;
      cantidad: string;
      unidad: string;
      merma_bp: number;
    }>`
      select producto_id, insumo_id, cantidad, unidad, merma_bp from recetas
      where organizacion_id = ${organizacionId} order by producto_id, created_at
    `.execute(db),
  ]);
  return {
    productos: productos.rows.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precioCentavos: p.precio.toString(),
      costoCentavos: p.costo.toString(),
      utilidadCentavos: p.utilidad.toString(),
      margenBp: p.margen.toString(),
    })),
    insumos: insumos.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      unidad: i.unidad_base,
      costoUnitarioCentavos: i.costo_unitario_centavos.toString(),
    })),
    recetas: recetas.rows.map((r) => ({
      productoId: r.producto_id,
      insumoId: r.insumo_id,
      cantidad: r.cantidad,
      unidad: r.unidad,
      mermaBp: r.merma_bp,
    })),
  };
}
