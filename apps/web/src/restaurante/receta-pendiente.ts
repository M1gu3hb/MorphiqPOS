/**
 * RECETA PENDIENTE: un platillo que se vende por receta y todavía no tiene una (DP-5).
 *
 * En Don Poncho TODO el menú nace así: el dueño captura las recetas después, en Recetas. No es
 * una columna nueva ni un estado guardado: se DERIVA de dos datos que el puente ya sirve —la
 * estrategia del producto (`estrategia_consumo = 'receta'`) y sus líneas de receta activas— y se
 * borra solo en cuanto la receta tiene su primer ingrediente.
 *
 * Mientras esté pendiente:
 *   · se vende igual: el cobro no descuenta nada de un platillo sin líneas y no lo bloquea
 *     (`venta/cobrar.ts`, «un producto marcado receta SIN líneas activas no descuenta nada»);
 *   · su costo es DESCONOCIDO, nunca $0.00: `costo_unitario_centavos` es `not null default 0`,
 *     así que el costo guardado de un platillo sin receta es un cero que no significa nada, y
 *     con él el margen guardado sale 100 % «sano»;
 *   · su margen se dice «Sin costo».
 *
 * Vive aquí, sin JSX, para probarse: lo usan Recetas, Productos y el tablero.
 */

export const ETIQUETA_RECETA_PENDIENTE = 'Receta pendiente';
export const ETIQUETA_COSTO_DESCONOCIDO = 'Costo desconocido';
export const ETIQUETA_SIN_COSTO = 'Sin costo';

/** La estrategia de lo que se prepara con receta. */
const POR_RECETA = 'receta';

/** Lo que hace falta saber del producto. El puente lo sirve a todos los roles. */
export interface ProductoQuizaConReceta {
  readonly id: string;
  readonly estrategia_consumo?: string | null | undefined;
}

/** Lo que hace falta saber de cada línea de receta (`RecetaEscandallo`). */
export interface LineaQuizaActiva {
  readonly producto_id: string;
  /** `false` es una línea dada de baja; ausente o nula cuenta como activa. */
  readonly activo?: boolean | null | undefined;
}

/** ¿Tiene ESTE producto la receta pendiente, con sus líneas en la mano? */
export function tieneRecetaPendiente(
  producto: ProductoQuizaConReceta,
  lineasDelProducto: readonly LineaQuizaActiva[],
): boolean {
  if (producto.estrategia_consumo !== POR_RECETA) return false;
  return !lineasDelProducto.some((linea) => linea.activo !== false);
}

/** Los productos con la receta pendiente, por ID, de una sola pasada sobre las líneas. */
export function recetasPendientes(
  productos: readonly ProductoQuizaConReceta[],
  lineas: readonly LineaQuizaActiva[],
): ReadonlySet<string> {
  const conLineaActiva = new Set(
    lineas.filter((linea) => linea.activo !== false).map((linea) => linea.producto_id),
  );
  return new Set(
    productos
      .filter((p) => p.estrategia_consumo === POR_RECETA && !conLineaActiva.has(p.id))
      .map((p) => p.id),
  );
}

/**
 * El costo que se puede ENSEÑAR, en centavos: el guardado, salvo con la receta pendiente, que
 * es desconocido (`null`). Recibe el costo ya leído por `centavosDe`.
 */
export function costoVisible(pendiente: boolean, costoCentavos: number | null): number | null {
  return pendiente ? null : costoCentavos;
}

/** El margen que se puede enseñar: el guardado, salvo con la receta pendiente (`null`). */
export function margenVisible(pendiente: boolean, margen: number | null): number | null {
  return pendiente ? null : margen;
}

/** Lo que dice el tablero: «1 platillo sin receta», «12 platillos sin receta». */
export function avisoDeRecetasPendientes(cuantos: number): string | null {
  if (cuantos <= 0) return null;
  return `${String(cuantos)} ${cuantos === 1 ? 'platillo' : 'platillos'} sin receta`;
}
