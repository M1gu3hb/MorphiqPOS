/**
 * EL ÁREA CON LA QUE NACE UN PLATILLO (DP-9.1).
 *
 * El área de preparación decide si un platillo genera comanda: `cocina`, `barra` o `ambos`; en
 * `ninguno` no sale a ninguna pantalla. La estación a la que llega la pone su categoría, pero el
 * área es del platillo, y la base no guarda el área de una estación. Así que el área de un
 * platillo nuevo se aprende de lo que YA hace su categoría y, si la categoría todavía no tiene
 * platillos, de lo que hacen las demás categorías de su estación. Si no hay de dónde aprenderlo,
 * `null`: no se inventa, lo decide alguien.
 */

/** Las áreas que generan comanda. `ninguno` no enseña nada sobre a dónde va un platillo. */
export const AREAS_CON_COMANDA = ['cocina', 'barra', 'ambos'] as const;
export type AreaConComanda = (typeof AREAS_CON_COMANDA)[number];

/** Todas las que acepta la columna, `ninguno` incluida (un platillo que no se prepara). */
export const AREAS_DE_PREPARACION = [...AREAS_CON_COMANDA, 'ninguno'] as const;
export type AreaDePreparacion = (typeof AREAS_DE_PREPARACION)[number];

export interface ProductoConArea {
  readonly categoriaId: string | null;
  readonly area: string;
  readonly activo: boolean;
}

function esAreaConComanda(valor: string): valor is AreaConComanda {
  return (AREAS_CON_COMANDA as readonly string[]).includes(valor);
}

/** La más frecuente; un empate lo rompe el orden de `AREAS_CON_COMANDA`, no el de la lista. */
function laMasFrecuente(productos: readonly ProductoConArea[]): AreaConComanda | null {
  const cuenta = new Map<AreaConComanda, number>();
  for (const producto of productos) {
    if (!producto.activo || !esAreaConComanda(producto.area)) continue;
    cuenta.set(producto.area, (cuenta.get(producto.area) ?? 0) + 1);
  }
  let ganadora: AreaConComanda | null = null;
  for (const area of AREAS_CON_COMANDA) {
    const veces = cuenta.get(area) ?? 0;
    if (veces > 0 && (ganadora === null || veces > (cuenta.get(ganadora) ?? 0))) ganadora = area;
  }
  return ganadora;
}

/**
 * @param categoriasDeLaEstacion las categorías que cuelgan de la misma estación que la del
 *   platillo (la suya incluida). Vacío si su categoría no tiene estación.
 */
export function areaPorOmision(
  categoriaId: string | null,
  productos: readonly ProductoConArea[],
  categoriasDeLaEstacion: ReadonlySet<string>,
): AreaConComanda | null {
  if (categoriaId === null) return null;
  const deSuCategoria = laMasFrecuente(productos.filter((p) => p.categoriaId === categoriaId));
  if (deSuCategoria !== null) return deSuCategoria;
  return laMasFrecuente(
    productos.filter((p) => p.categoriaId !== null && categoriasDeLaEstacion.has(p.categoriaId)),
  );
}
