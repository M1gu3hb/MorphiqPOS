import { medidasDeMesa, type MesaEnPlano } from '@morphiqpos/domain/sala';

/**
 * EL PLANO PARA UNIR MESAS (DP-9.6), del lado de la pantalla: de las mesas del puente a cajas en
 * el plano, dónde va una mesa que se junta con un toque, cuánto se encoge el plano en un
 * teléfono y cómo se rotula la principal. La regla de qué se puede unir es la del dominio.
 */

export interface MesaDelPlanoDeUnion {
  readonly id: string;
  readonly numero: number;
  readonly posicion_x?: number | null;
  readonly posicion_y?: number | null;
  readonly forma?: string | null;
  readonly tamano?: string | null;
  readonly unida_a_mesa_id?: string | null;
}

/** Donde el mapa pinta una mesa sin posición: igual que `MesaShape`. */
const POSICION_POR_OMISION = 100;
/** Lo que se deja de margen al acomodar el plano en una pantalla angosta. */
const MARGEN = 16;

export function mesasEnPlano(mesas: readonly MesaDelPlanoDeUnion[]): MesaEnPlano[] {
  return mesas.map((m) => ({
    id: m.id,
    x: m.posicion_x ?? POSICION_POR_OMISION,
    y: m.posicion_y ?? POSICION_POR_OMISION,
    ...medidasDeMesa(m.forma, m.tamano),
  }));
}

/** Las absorbidas en una unión viva no se pintan: su gente está en la principal. */
export function sinAbsorbidas<T extends MesaDelPlanoDeUnion>(mesas: readonly T[]): T[] {
  return mesas.filter((m) => m.unida_a_mesa_id === null || m.unida_a_mesa_id === undefined);
}

/** «Unida con 2 · 5» para la principal de una unión; `null` si no lo es. */
export function nombreConUnidas(
  mesa: MesaDelPlanoDeUnion,
  mesas: readonly MesaDelPlanoDeUnion[],
): string | null {
  const unidas = mesas
    .filter((m) => m.unida_a_mesa_id === mesa.id)
    .map((m) => m.numero)
    .sort((a, b) => a - b);
  return unidas.length === 0 ? null : `Unida con ${unidas.join(' · ')}`;
}

/**
 * Juntar CON UN TOQUE (la alternativa a arrastrar): la mesa va a la derecha de la que esté más a
 * la derecha del grupo; si ahí estorba otra, abajo de la de más abajo. Siempre pegada al grupo y
 * sin encimarse con nadie.
 */
export function juntarAlGrupo(
  id: string,
  grupo: readonly string[],
  plano: readonly MesaEnPlano[],
): { readonly x: number; readonly y: number } {
  const movida = plano.find((m) => m.id === id);
  const delGrupo = plano.filter((m) => grupo.includes(m.id));
  if (movida === undefined || delGrupo.length === 0)
    return { x: movida?.x ?? 0, y: movida?.y ?? 0 };
  const otras = plano.filter((m) => m.id !== id && !grupo.includes(m.id));
  // Libre: no se encima con ninguna otra (tocarla de lado sí se vale).
  const libre = (x: number, y: number) =>
    !otras.some(
      (o) =>
        x < o.x + o.ancho && o.x < x + movida.ancho && y < o.y + o.alto && o.y < y + movida.alto,
    );
  const derecha = delGrupo.reduce((a, b) => (b.x + b.ancho > a.x + a.ancho ? b : a));
  if (libre(derecha.x + derecha.ancho, derecha.y))
    return { x: derecha.x + derecha.ancho, y: derecha.y };
  const abajo = delGrupo.reduce((a, b) => (b.y + b.alto > a.y + a.alto ? b : a));
  return { x: abajo.x, y: abajo.y + abajo.alto };
}

/** Cuánto se encoge el plano para caber en `ancho` (nunca se agranda). */
export function escalaDelPlano(ancho: number, plano: readonly MesaEnPlano[]): number {
  const derecha = Math.max(0, ...plano.map((m) => m.x + m.ancho)) + MARGEN;
  return derecha <= ancho ? 1 : Math.max(0.2, ancho / derecha);
}
