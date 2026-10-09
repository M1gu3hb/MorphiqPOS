/**
 * LA ÚLTIMA PASADA del documento del corte para quien NO ve costos (auditoría de la 2.4).
 *
 * El corte ocultaba el costo campo por campo, y se le escaparon cinco —la merma de
 * barra, el consumo de la casa, los dos costos de los sellos, las garantías— y el margen
 * objetivo, que con el precio DA el costo. Un cajero sin `mostrar_costos_a_caja`
 * recibía todo eso en la respuesta, aunque la pantalla no lo pintara.
 *
 * Esto recorre el documento ENTERO y deja en `null` toda clave que empiece por `costo` o
 * por `margen`, a cualquier profundidad. Una sección nueva que traiga costo queda
 * cubierta sin que nadie se acuerde de este archivo; la que necesite un nombre así sin
 * ser costo tendrá que llamarse de otra manera, y es lo correcto.
 */

const ES_COSTO = /^(costo|margen)/i;

function recorrer(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(recorrer);
  if (valor === null || typeof valor !== 'object' || valor instanceof Date) return valor;
  return Object.fromEntries(
    Object.entries(valor).map(([clave, dentro]) => [
      clave,
      ES_COSTO.test(clave) ? null : recorrer(dentro),
    ]),
  );
}

/**
 * El documento sin un solo costo, o tal cual si quien lo pide los ve. El tipo no cambia:
 * todo campo de costo del documento ya está declarado como `string | null` o
 * `number | null`, que es lo que esta función escribe.
 */
export function sinCostosSiNoLosVe<T extends object>(documento: T, verCostos: boolean): T {
  // La conversión es la del recorrido genérico: la forma de entrada se conserva y sólo
  // cambian valores a `null` en claves que el tipo ya declara anulables.
  return verCostos ? documento : (recorrer(documento) as T);
}
