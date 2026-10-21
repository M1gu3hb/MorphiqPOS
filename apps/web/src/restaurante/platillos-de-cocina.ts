/**
 * LO QUE LA COCINA TODAVÍA TIENE QUE PREPARAR de una comanda (día completo del restaurante, 2.4).
 *
 * Anular un platillo en la mesa —«me equivoqué al tomar la orden»— cancela su item de comanda,
 * no la comanda: si lleva más platillos sigue viva. El tablero de cocina pintaba TODOS los items
 * que la comanda tiene, cancelados incluidos, así que el cocinero veía la sopa que la mesa ya
 * quitó, sin una sola señal de que no era para preparar, y la hacía: un plato que nadie paga y
 * un insumo que se gasta sin dejar rastro en la venta. Una comanda cuyos platillos se anularon
 * TODOS ni siquiera tiene qué preparar y se quedaba en «Nuevos» como una tarjeta vacía.
 *
 * Los items llegan por el puente con su `estado`; uno que no lo trae (las pruebas de la pantalla
 * pasan sus filas a mano) se toma por vivo, que es lo que era hasta hoy.
 */

export interface ItemParaPreparar {
  readonly estado?: string | null;
}

/** Un item cancelado se anuló en la mesa: no se prepara. */
export function sePrepara(item: ItemParaPreparar): boolean {
  return item.estado !== 'cancelado';
}

/** Los items que la cocina tiene que preparar, en su orden. */
export function platillosPorPreparar<T extends ItemParaPreparar>(
  items: readonly T[],
): readonly T[] {
  return items.filter(sePrepara);
}

/**
 * ¿Hay algo que preparar en esta comanda? Una sin items —un dato a medias— sigue enseñándose,
 * como siempre: esconderla sería esconder trabajo; una con items y TODOS cancelados, no.
 */
export function tieneQuePreparar(items: readonly ItemParaPreparar[]): boolean {
  return items.length === 0 || items.some(sePrepara);
}
