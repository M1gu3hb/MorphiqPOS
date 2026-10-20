/**
 * EL ENTER DEL BUSCADOR DEL CONTEO SIEMPRE CONTESTA (20-10-2026).
 *
 * El escáner teclea el código y manda Enter. Si el código no era de esta zona —o el Enter
 * llegaba solo, con el campo vacío— la pantalla no hacía NADA: el encargado, frente al
 * anaquel, no sabía si el lector falló, si el producto es de otra zona o si tiene que volver
 * a escanear. El rastreo lo acusaba a veces y a veces no, según si la página terminaba de
 * cargar antes del Enter. Ahora la búsqueda dice siempre qué pasó.
 */

/** Lo que pasó al dar Enter. */
export type ResultadoDeLaBusqueda<P> =
  | { readonly tipo: 'vacia' }
  | { readonly tipo: 'sin_coincidencia'; readonly texto: string }
  | { readonly tipo: 'encontrado'; readonly producto: P };

/** Por código exacto o por un pedazo del nombre, sin importar mayúsculas. */
export function buscarEnLaZona<
  P extends { readonly codigo: string | null; readonly nombre: string },
>(busqueda: string, filas: readonly P[]): ResultadoDeLaBusqueda<P> {
  const texto = busqueda.trim();
  if (texto === '') return { tipo: 'vacia' };
  const minusculas = texto.toLowerCase();
  const producto = filas.find(
    (f) => f.codigo === minusculas || f.nombre.toLowerCase().includes(minusculas),
  );
  return producto === undefined
    ? { tipo: 'sin_coincidencia', texto }
    : { tipo: 'encontrado', producto };
}
