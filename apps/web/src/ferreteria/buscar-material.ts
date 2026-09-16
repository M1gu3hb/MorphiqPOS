/**
 * F-152 y F-059 · Encontrar la pieza, y decir dónde está.
 *
 * ── Por qué esto vive aparte de la pantalla ──────────────────────────────
 * Porque es el corazón del modelo y el resto de `Mostrador.tsx` es su envoltorio.
 * Un producto de ferretería no tiene nombre útil: tiene una combinación de
 * medidas, y `1/4 x 2`, `1/4x2`, `.25 × 2` y `1/4"x2"` son EL MISMO DATO.
 * Nadie teclea dos veces igual, y el que busca tiene al cliente enfrente.
 *
 * ── Y por qué el orden NUNCA es alfabético ───────────────────────────────
 * Primero el que coincide en MEDIDA, después el que HAY. El de 2,340 piezas en
 * existencia va arriba del que tiene 3: ordenar por nombre pone el que no hay
 * en el primer renglón, y el mostradorista vuelve a su memoria — que es
 * exactamente el problema que este modelo viene a resolver.
 *
 * ── La ubicación (F-152) no es un adorno del resultado ───────────────────
 * Sin ella el resultado no termina la venta: se encuentra la pieza en la
 * pantalla y no en el pasillo. Va dentro del material, y por eso viaja en la
 * misma fila que se busca.
 */

export interface MaterialDeMostrador {
  readonly id: string;
  readonly nombre: string;
  /** Va primero: el nombre es el mismo en las cinco filas, la medida no. */
  readonly medida: string;
  readonly acabado: string | null;
  readonly marca: string | null;
  readonly precioCentavos: number;
  /** Ya con la lista del cliente aplicada, con o sin IVA según su lista. */
  readonly existencia: number;
  readonly unidad: string;
  /** F-152. Sin esto el resultado no termina la venta. */
  readonly ubicacion: string | null;
  readonly linea: string;
}

/**
 * `1/4 x 2`, `1/4x2`, `.25 × 2` y `1/4"x2"` son EL MISMO DATO.
 *
 * La normalización de la medida no es una comodidad: sin ella no funciona nada.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/["']/g, '')
    .replace(/\s*[x×*]\s*/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

function pajarDe(material: MaterialDeMostrador): string {
  return normalizar(
    `${material.nombre} ${material.medida} ${material.acabado ?? ''} ${material.marca ?? ''} ${material.linea}`,
  );
}

/**
 * Filtro progresivo: cada palabra estrecha. El orden NUNCA es alfabético —
 * primero el que coincide en medida, después el que hay: el de 2,340 en
 * existencia va arriba del que tiene 3.
 */
export function buscar(
  filas: readonly MaterialDeMostrador[],
  palabras: readonly string[],
): readonly MaterialDeMostrador[] {
  if (palabras.length === 0) return [];
  const hallados = filas.filter((f) => palabras.every((p) => pajarDe(f).includes(p)));
  return [...hallados].sort((a, b) => {
    const ma = palabras.some((p) => normalizar(a.medida).includes(p)) ? 1 : 0;
    const mb = palabras.some((p) => normalizar(b.medida).includes(p)) ? 1 : 0;
    if (ma !== mb) return mb - ma;
    return b.existencia - a.existencia;
  });
}

/** Las que le pueden servir cuando no hay ninguna exacta. Aproximación por familia. */
export function cercanas(
  filas: readonly MaterialDeMostrador[],
  palabras: readonly string[],
): readonly MaterialDeMostrador[] {
  return [...filas]
    .filter((f) => palabras.some((p) => normalizar(`${f.nombre} ${f.linea}`).includes(p)))
    .sort((a, b) => b.existencia - a.existencia)
    .slice(0, 5);
}
