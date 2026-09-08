/**
 * Alturas de control de la operación.
 *
 * Dos exigencias que chocan y aquí se resuelven juntas:
 *
 *  · la perilla de densidad (`--altura-control`) tiene que seguir mandando —una
 *    altura fija en píxeles la puentea y el sistema de diseño deja de servir—;
 *  · ningún objetivo táctil puede bajar de 44 px, que es el mínimo de WCAG 2.2
 *    y de las guías de Apple, y la densidad `compacta` deja la perilla en 32.
 *
 * `max()` hace las dos cosas: la densidad escala hacia arriba y el piso táctil
 * no se cruza nunca. No es un rodeo del contrato de primitivas: es el contrato
 * más un suelo.
 */

/** Controles normales: selects, botones secundarios, ± del carrito. */
export const ALTO_CONTROL = 'h-[max(2.75rem,var(--altura-control))]';

/** Acciones de un diálogo: cobrar, cancelar, abrir caja. */
export const ALTO_ACCION = 'h-[max(3.25rem,calc(var(--altura-control)*1.3))]';

/** La acción principal de la pantalla y los campos que se teclean a ciegas. */
export const ALTO_DESTACADO = 'h-[max(3.75rem,calc(var(--altura-control)*1.5))]';

/** Botón cuadrado: mismo suelo táctil en los dos lados. */
export const CUADRO_TOQUE = 'size-[max(2.75rem,var(--altura-control))]';
