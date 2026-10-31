/**
 * QUÉ CAMBIÓ ENTRE DOS LECTURAS DE UNA LISTA (DP-11.2). Puro.
 *
 * La primera lectura (`antes === null`) es la referencia y no cambia nada: lo que ya estaba al
 * abrir la pantalla no despierta a nadie, el mismo cuidado que los vigilantes heredados
 * (`PedidoListoWatcher`) tienen con la primera carga.
 */
export function cambiosDeLaLista(
  antes: ReadonlySet<string> | null,
  ahora: readonly string[],
): { readonly nuevas: string[]; readonly idas: string[]; readonly vistas: Set<string> } {
  const vistas = new Set(ahora);
  if (antes === null) return { nuevas: [], idas: [], vistas };
  return {
    nuevas: ahora.filter((id) => !antes.has(id)),
    idas: [...antes].filter((id) => !vistas.has(id)),
    vistas,
  };
}
