/**
 * F-331 · Qué líneas de una receta aplican a cada canal de venta.
 *
 * ── Cinco a ocho puntos de margen, invisibles ──────────────────────────────
 * Un latte para tomar aquí va en taza; el mismo latte para llevar va en vaso,
 * tapa y funda. Sin esta separación la receta es una sola, el empaque no está
 * en el costo, y TODOS los márgenes de la plantilla salen inflados: la dueña
 * cree que gana un 68 % donde gana un 61 %. Y de paso nadie puede contestar
 * cuántos vasos pedir el mes que viene.
 *
 * ── Nulo es «aplica a todos», y no es lo mismo que «aplica a los cuatro» ───
 * Una línea sin canales declarados es la receta histórica: el café y la leche
 * van en todas. Sembrar el arreglo completo diría otra cosa —«aplica a los
 * cuatro canales que existen hoy»— y esa afirmación envejece mal en cuanto
 * entre un quinto canal.
 */
export function lineasDelCanal<T extends { readonly aplicaCanal: readonly string[] | null }>(
  receta: readonly T[],
  canal: string,
): T[] {
  return receta.filter((linea) => linea.aplicaCanal === null || linea.aplicaCanal.includes(canal));
}
