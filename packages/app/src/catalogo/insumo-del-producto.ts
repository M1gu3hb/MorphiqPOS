import 'server-only';

import type { Transaccion } from '@morphiqpos/data';

/**
 * EL INSUMO QUE LLEVA LA EXISTENCIA DE UN PRODUCTO.
 *
 * Hay dos ligas en el esquema y no son la misma cosa:
 *
 * · `insumos.producto_id` — la del producto de REVENTA: la pieza que se compra y se
 *   vende entera. La escribe el alta rápida (`catalogo.alta_rapida`) y la lee la venta
 *   (`repoVentaCatalogo.productoParaVender`) para descontar. Es la de los cinco giros:
 *   en las demostraciones la tienen TODOS los productos que llevan existencia.
 * · `productos.insumo_base_id` — la de la estrategia de consumo `insumo_base` (la 040):
 *   el producto que se sirve DE otro insumo —el granel, la porción—. En las cinco
 *   demostraciones no la tiene ninguno.
 *
 * Cuatro comandos leían sólo la segunda —las existencias del salón, abrir a cabina, la
 * garantía y el peso de la ferretería— y con un producto dado de alta como se da de alta
 * contestaban «no lleva existencia». Aquí manda la de reventa y, si no hay, la de consumo.
 */
export async function insumosDeProductos(
  tx: Transaccion,
  organizacionId: string,
  productoIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const ids = [...new Set(productoIds)];
  if (ids.length === 0) return new Map();
  const [deReventa, deConsumo] = await Promise.all([
    tx
      .selectFrom('insumos')
      .select(['id', 'producto_id'])
      .where('organizacion_id', '=', organizacionId)
      .where('producto_id', 'in', ids)
      .execute(),
    tx
      .selectFrom('productos')
      .select(['id', 'insumo_base_id'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', 'in', ids)
      .where('insumo_base_id', 'is not', null)
      .execute(),
  ]);
  const mapa = new Map<string, string>();
  for (const fila of deConsumo) {
    if (fila.insumo_base_id !== null) mapa.set(fila.id, fila.insumo_base_id);
  }
  // La de reventa gana: es la que descuenta la venta.
  for (const fila of deReventa) {
    if (fila.producto_id !== null) mapa.set(fila.producto_id, fila.id);
  }
  return mapa;
}

/** El de UN producto, o `null` si no lleva existencia (un servicio). */
export async function insumoDelProducto(
  tx: Transaccion,
  organizacionId: string,
  productoId: string,
): Promise<string | null> {
  return (await insumosDeProductos(tx, organizacionId, [productoId])).get(productoId) ?? null;
}
