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
      } else if (JSON.stringify(declarada) !== JSON.stringify(aplicada)) {
        diferencias.push(`${categoria}: definición distinta → ${clave}`);
      }
    }
  }

  return diferencias;
}
