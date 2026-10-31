/**
 * LA GEOMETRÍA DE UNIR MESAS (DP-9.6).
 *
 * En el mapa del mesero las mesas se arrastran; al acercarse se atraen (imán) y al tocarse se
 * funden. Sólo se unen mesas que quedan físicamente juntas: cada una pegada a otra del grupo, y
 * el grupo dentro de un perímetro razonable. Sin tope de cuántas —se quitó el «hasta seis»—,
 * pero medio salón no se une por accidente: el grupo tiene que caber en
 * `LADO_LARGO_MAXIMO × LADO_CORTO_MAXIMO` puntos del plano (una hilera de cinco rectangulares
 * medianas, o un bloque de tres por dos).
 *
 * Puro: la pantalla lo usa para el imán y para decir qué falta; el servidor, para no aceptar un
 * grupo que no cumple. Las mesas redondas se miden por su caja, como las pinta el mapa.
 */

export interface MesaEnPlano {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

const MEDIDAS = {
  chica: {
    redonda: { ancho: 60, alto: 60 },
    cuadrada: { ancho: 60, alto: 60 },
    rectangular: { ancho: 90, alto: 55 },
  },
  mediana: {
    redonda: { ancho: 80, alto: 80 },
    cuadrada: { ancho: 80, alto: 80 },
    rectangular: { ancho: 120, alto: 70 },
  },
  grande: {
    redonda: { ancho: 110, alto: 110 },
    cuadrada: { ancho: 110, alto: 110 },
    rectangular: { ancho: 160, alto: 90 },
  },
} as const;

type Tamano = keyof typeof MEDIDAS;
type Forma = keyof (typeof MEDIDAS)['mediana'];

/** A esta distancia o menos, dos mesas cuentan como pegadas. */
export const TOLERANCIA_DE_CONTACTO = 8;
/** Soltada a esta distancia o menos de otra, una mesa se pega a ella. */
export const IMAN = 36;
export const LADO_LARGO_MAXIMO = 640;
export const LADO_CORTO_MAXIMO = 400;

/** Las medidas con las que el mapa pinta una mesa (la mediana redonda si no se sabe). */
export function medidasDeMesa(
  forma: string | null | undefined,
  tamano: string | null | undefined,
): { readonly ancho: number; readonly alto: number } {
  const porTamano =
    tamano !== null && tamano !== undefined && tamano in MEDIDAS
      ? MEDIDAS[tamano as Tamano]
      : MEDIDAS.mediana;
  return forma !== null && forma !== undefined && forma in porTamano
    ? porTamano[forma as Forma]
    : porTamano.redonda;
}

/** La distancia entre los bordes de dos mesas; 0 si se tocan o se enciman. */
function distancia(a: MesaEnPlano, b: MesaEnPlano): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.ancho, b.x + b.ancho));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.alto, b.y + b.alto));
  return Math.hypot(dx, dy);
}

export function seTocan(a: MesaEnPlano, b: MesaEnPlano): boolean {
  return distancia(a, b) <= TOLERANCIA_DE_CONTACTO;
}

/**
 * EL IMÁN: si la mesa soltada quedó a `IMAN` o menos de otra —o encima—, se pega al lado de la
 * más cercana que menos la mueva, sin encimarse. Si no, se queda donde la soltaron.
 */
export function atraer(movida: MesaEnPlano, otras: readonly MesaEnPlano[]): MesaEnPlano {
  const cercanas = otras
    .filter((o) => o.id !== movida.id)
    .map((o) => ({ o, d: distancia(movida, o) }))
    .filter(({ d }) => d <= IMAN)
    .sort((p, q) => p.d - q.d);
  const fija = cercanas[0]?.o;
  if (fija === undefined) return movida;
  const candidatos = [
    { x: fija.x - movida.ancho, y: movida.y },
    { x: fija.x + fija.ancho, y: movida.y },
    { x: movida.x, y: fija.y - movida.alto },
    { x: movida.x, y: fija.y + fija.alto },
  ];
  const mejor = candidatos.reduce((a, b) =>
    Math.hypot(b.x - movida.x, b.y - movida.y) < Math.hypot(a.x - movida.x, a.y - movida.y) ? b : a,
  );
  return { ...movida, x: mejor.x, y: mejor.y };
}

/** Las mesas que tocan a `id`, y las que tocan a ésas: su grupo, ella incluida. */
export function grupoDe(id: string, mesas: readonly MesaEnPlano[]): string[] {
  const vistas = new Set([id]);
  const pendientes = [id];
  for (let actual = pendientes.pop(); actual !== undefined; actual = pendientes.pop()) {
    const esta = mesas.find((m) => m.id === actual);
    if (esta === undefined) continue;
    for (const otra of mesas) {
      if (!vistas.has(otra.id) && seTocan(esta, otra)) {
        vistas.add(otra.id);
        pendientes.push(otra.id);
      }
    }
  }
  return [...vistas];
}

/** `null` si esas mesas se pueden unir así como quedaron; si no, qué falta, para decirlo. */
export function revisarUnion(mesas: readonly MesaEnPlano[]): string | null {
  const primera = mesas[0];
  if (primera === undefined || mesas.length < 2) return 'Una unión es de dos o más mesas.';
  if (grupoDe(primera.id, mesas).length !== mesas.length) {
    return 'Las mesas tienen que quedar pegadas: cada una junto a otra del grupo.';
  }
  const ancho = Math.max(...mesas.map((m) => m.x + m.ancho)) - Math.min(...mesas.map((m) => m.x));
  const alto = Math.max(...mesas.map((m) => m.y + m.alto)) - Math.min(...mesas.map((m) => m.y));
  if (Math.max(ancho, alto) > LADO_LARGO_MAXIMO || Math.min(ancho, alto) > LADO_CORTO_MAXIMO) {
    return 'El grupo ocupa demasiado del salón: une menos mesas, o en un bloque más junto.';
  }
  return null;
}
