/**
 * Los estados que gobiernan lo que el portal lee y lo que el portal ESCRIBE.
 *
 * ── Por qué en un solo sitio ──────────────────────────────────────────────
 * Hasta el hallazgo 1 del veredicto, cinco archivos de este módulo repetían la
 * misma lista de estados para el `select` y ninguno la usaba para el `update`.
 * Dos listas que dicen lo mismo se desincronizan sin que nadie lo note, y el
 * día en que la lectura admita un estado que la escritura no esperaba, la
 * escritura **no falla**: escribe sobre una cuenta que ya cambió.
 *
 * Aquí el `where` de la lectura y el `where` de la escritura salen de la MISMA
 * constante, así que no pueden divergir.
 */

/** Los cinco de `ESTADOS_VENTA_ACTIVA` (qrPedidoFlow.js:20-25), traducidos. */
export const ORDEN_ACTIVA = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

/**
 * Una cuenta cobrada o cancelada no se edita por ningún camino (`F1-04` §6.6).
 *
 * Misma lista que `restaurante/cuenta.ts:31` y `mesas-escrituras.ts:22`: es la
 * definición de «cerrada» del sistema, no una del portal.
 */
export const ORDEN_CERRADA = ['pagada', 'cancelada'] as const;

/**
 * Estados desde los que el comensal todavía puede agregar productos.
 *
 * Es `ORDEN_ACTIVA` menos `cuenta_solicitada`: con la cuenta pedida, lo que
 * llega al mesero ya no incluiría los tacos nuevos.
 */
export const ORDEN_ADMITE_PEDIDO = ['borrador', 'confirmada', 'en_preparacion', 'lista'] as const;

/**
 * La visita que el comensal puede valorar: la viva, o la que se acaba de pagar.
 *
 * `borrador` no está porque una mesa que se abrió y no consumió nada no es una
 * visita que valorar.
 */
export const ORDEN_VALORABLE = [
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
  'pagada',
] as const;

/**
 * Estados de mesa en los que no hay nadie sentado (`restaurante/cuenta.ts:34`).
 *
 * Marcar «pedido enviado» o «cuenta solicitada» sobre una mesa en uno de estos
 * cuatro deja una mesa ocupada sin comensales: el `check mesa_libre_sin_orden`
 * (045_restaurante.sql:276) no lo impide, porque sólo prohíbe `libre` CON orden.
 */
export const MESA_SIN_COMENSALES = ['libre', 'limpieza', 'pagada', 'cancelada'] as const;

/** ¿Está `estado` en la lista? Evita repetir el ensanchado a `readonly string[]`. */
export function esUnoDe(lista: readonly string[], estado: string): boolean {
  return lista.includes(estado);
}
