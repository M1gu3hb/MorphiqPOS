import { createHash } from 'node:crypto';

/**
 * El azar DETERMINISTA del historial de presentación.
 *
 * ── Por qué no `Math.random` ────────────────────────────────────────────────
 * El historial tiene que poder repetirse: la misma semilla y el mismo día dan los mismos
 * tickets, a la misma hora y por el mismo importe. Sin eso no hay prueba posible de que lo
 * sembrado cuadra, y una demostración que se ve distinta cada vez que se vuelve a sembrar no
 * se puede ensayar. Cada DÍA tiene su propio flujo de números, derivado de la semilla y del
 * día: sembrar el día 7 antes o después del 3 no cambia lo que sale en el 3.
 *
 * ── Los ids también salen de aquí ───────────────────────────────────────────
 * Un id se deriva de la organización, la semilla, el día y una clave por fila. Si por un
 * descuido un día se sembrara dos veces, la segunda chocaría con la llave primaria en vez de
 * duplicar el día en silencio. Y la organización va dentro del hash: dos espejos sembrados con
 * la misma semilla no comparten ni un id.
 */

const DOS_A_32 = 4_294_967_296;

/** Un generador mulberry32: 32 bits de estado, suficiente para unos miles de números por día. */
export class Azar {
  #estado: number;

  constructor(semilla: number) {
    this.#estado = semilla >>> 0;
  }

  /** Un real en [0, 1). */
  siguiente(): number {
    this.#estado = (this.#estado + 0x6d2b79f5) >>> 0;
    let t = this.#estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / DOS_A_32;
  }

  /** Un entero en [minimo, maximo], los dos extremos incluidos. */
  entero(minimo: number, maximo: number): number {
    return minimo + Math.floor(this.siguiente() * (maximo - minimo + 1));
  }

  /** `true` con la probabilidad dada (0 a 1). */
  probabilidad(p: number): boolean {
    return this.siguiente() < p;
  }

  /** Un elemento cualquiera. La lista no puede estar vacía. */
  elegir<T>(lista: readonly T[]): T {
    const elegido = lista[this.entero(0, lista.length - 1)];
    if (elegido === undefined) throw new RangeError('No se puede elegir de una lista vacía.');
    return elegido;
  }

  /** Un elemento con probabilidad proporcional a su peso. Los pesos no negativos, alguno > 0. */
  ponderado<T>(opciones: readonly { readonly valor: T; readonly peso: number }[]): T {
    const total = opciones.reduce((suma, o) => suma + Math.max(0, o.peso), 0);
    if (opciones.length === 0 || total <= 0) {
      throw new RangeError('No se puede elegir sin opciones con peso.');
    }
    let umbral = this.siguiente() * total;
    for (const opcion of opciones) {
      umbral -= Math.max(0, opcion.peso);
      if (umbral < 0) return opcion.valor;
    }
    const ultima = opciones[opciones.length - 1];
    if (ultima === undefined) throw new RangeError('No se puede elegir sin opciones con peso.');
    return ultima.valor;
  }
}

type Parte = string | number | bigint;

function resumen(partes: readonly Parte[]): Buffer {
  return createHash('sha256').update(partes.map(String).join('\u001f')).digest();
}

/** El generador de UN día de UN espejo: la misma entrada, el mismo flujo. */
export function azarDelDia(semilla: number, organizacionId: string, dia: string): Azar {
  return new Azar(resumen([semilla, organizacionId, dia]).readUInt32BE(0));
}

/** Un valor estable de 0 a 1 para una clave: la popularidad de un platillo, por ejemplo. */
export function valorEstable(...partes: readonly Parte[]): number {
  return resumen(partes).readUInt32BE(4) / DOS_A_32;
}

/** Un uuid versión 4 derivado de las partes. Mismas partes, mismo id; otras, otro. */
export function idDeterminista(...partes: readonly Parte[]): string {
  const bytes = Buffer.from(resumen(partes).subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
