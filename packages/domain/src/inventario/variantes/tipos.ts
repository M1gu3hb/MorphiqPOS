import type { Cantidad } from '../../catalogo/index.ts';

/**
 * El contrato de una variante de inventario.
 *
 * ── Qué es el tronco y qué es la variante ──────────────────────────────────
 * El TRONCO —`calcularConsumo`— sabe acumular por insumo, sumar, comprobar que
 * las unidades no se mezclan y armar el movimiento. Eso es idéntico en los 78
 * modelos y se escribe una vez.
 *
 * La VARIANTE sabe una sola cosa: **dada una línea de venta, qué insumos
 * consume y cuánto de cada uno.** Una receta explota en ingredientes; un
 * producto con presentaciones convierte caja a pieza; un servicio con tiempo no
 * consume nada.
 *
 * ── La regla que esto hace cumplir ─────────────────────────────────────────
 * *«Si el tronco tiene un `if` que pregunta por el giro, está mal hecho.»* El
 * tronco no sabe que existen los giros: recibe una estrategia y la usa. Añadir
 * V3 o V1 no toca `calcularConsumo` ni una línea, que es la única prueba de que
 * la extracción sirvió de algo.
 */

/** Lo que una variante decide consumir de UN insumo, por UNA línea. */
export interface ConsumoDeInsumo {
  readonly insumoId: string;
  /** Ya multiplicado por la cantidad de la línea y con la merma aplicada. */
  readonly cantidad: Cantidad;
  /** La unidad en la que el insumo lleva su existencia. */
  readonly unidadBase: string;
}

/**
 * Una variante de inventario.
 *
 * `planear` recibe la línea COMPLETA y la cantidad ya normalizada, y devuelve
 * lo que hay que restar. No toca existencias, no consulta catálogo y no lanza
 * movimientos: sólo decide. Quien cobra ejecuta el resultado en su transacción.
 */
export interface VarianteDeInventario<L> {
  /** El identificador que una línea declara para pedir esta variante. */
  readonly clave: string;
  /** Para qué sirve, en una frase. Sale en el catálogo de variantes. */
  readonly descripcion: string;
  readonly planear: (linea: L, cantidadLinea: Cantidad) => readonly ConsumoDeInsumo[];
}
