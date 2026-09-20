export interface EntradaContrato {
  readonly clave: string;
  readonly [campo: string]: string | boolean | null;
}

export interface ContratoEsquema {
  columnas: EntradaContrato[];
  restricciones: EntradaContrato[];
  indices: EntradaContrato[];
}

const CATEGORIAS = ['columnas', 'restricciones', 'indices'] as const;

/**
 * Serializa una entrada con las claves ORDENADAS.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 * La comparación era `JSON.stringify(declarada) !== JSON.stringify(aplicada)`,
 * y eso no compara el contrato: compara el ORDEN en que cada transporte
 * serializó los mismos campos. El contrato versionado lo escribió el CLI de
 * Supabase, que ordena las claves alfabéticamente; una conexión directa usa
 * `row_to_json`, que conserva el orden del `select`. Mismos valores, mismo
 * esquema, y la puerta declaraba 1 265 diferencias — todas falsas.
 *
 * Es el defecto peor de los dos posibles en este sitio: no deja pasar un
 * cambio real, pero grita tanto que el día que haya uno de verdad nadie lo
 * va a distinguir del ruido.
 */
function huellaEstable(entrada: EntradaContrato): string {
  const claves = Object.keys(entrada).sort();
  return JSON.stringify(claves.map((clave) => [clave, entrada[clave]]));
}

/** Compara el contrato versionado con la fotografía obtenida de PostgreSQL. */
export function diferenciasDeContrato(esperado: ContratoEsquema, real: ContratoEsquema): string[] {
  const diferencias: string[] = [];

  for (const categoria of CATEGORIAS) {
    const esperadas = new Map(esperado[categoria].map((entrada) => [entrada.clave, entrada]));
    const reales = new Map(real[categoria].map((entrada) => [entrada.clave, entrada]));
    const claves = new Set([...esperadas.keys(), ...reales.keys()]);

    for (const clave of [...claves].sort()) {
      const declarada = esperadas.get(clave);
      const aplicada = reales.get(clave);
      if (declarada === undefined) {
        diferencias.push(`${categoria}: aplicada y no declarada → ${clave}`);
      } else if (aplicada === undefined) {
        diferencias.push(`${categoria}: declarada y no aplicada → ${clave}`);
      } else if (huellaEstable(declarada) !== huellaEstable(aplicada)) {
        diferencias.push(`${categoria}: definición distinta → ${clave}`);
      }
    }
  }

  return diferencias;
}
