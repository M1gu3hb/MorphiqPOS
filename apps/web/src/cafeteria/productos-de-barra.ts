/** Una opción de bebida del puente: de qué producto es y de qué grupo. */
export interface OpcionDeBebida {
  readonly producto_id: string;
  readonly grupo: string | null;
}

/** Los grupos de cada producto, sin repetir, en el orden en que llegan (el del menú). */
export function gruposPorProducto(
  opciones: readonly OpcionDeBebida[],
): ReadonlyMap<string, readonly string[]> {
  const grupos = new Map<string, string[]>();
  for (const opcion of opciones) {
    if (opcion.grupo === null || opcion.grupo.trim() === '') continue;
    const suyos = grupos.get(opcion.producto_id) ?? [];
    if (!suyos.includes(opcion.grupo)) suyos.push(opcion.grupo);
    grupos.set(opcion.producto_id, suyos);
  }
  return grupos;
}

/** «16 %», «0 %», o nulo sin dato: la tasa como se lee en la ficha. */
export function ivaEnPalabras(bp: number | null | undefined): string | null {
  if (bp === null || bp === undefined) return null;
  return `IVA ${(bp / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 })} %`;
}
