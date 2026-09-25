/**
 * Lo que es PRODUCTO en el salón: lo que se vende entero en el anaquel o se abre en
 * cabina. Los SERVICIOS también son filas de `productos` —el corte, el tinte— y el
 * puente los sirve juntos; se distinguen porque sólo ellos tienen fila en `servicios`,
 * y con ella su primer tramo de duración, que ahí es obligatorio.
 *
 * Sin este filtro la pantalla de productos listaba el corte y el balayage como «Sólo se
 * vende», con su «—» de existencia (C.10 de la 2.4).
 */
export function sinServicios<T extends { readonly duracion_activa_1_min?: number | null }>(
  filas: readonly T[],
): readonly T[] {
  return filas.filter((p) => p.duracion_activa_1_min == null);
}
