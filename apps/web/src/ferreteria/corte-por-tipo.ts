/**
 * LAS TRES FORMAS DE CORTAR (C.10 de la 2.4): `tipo_corte` del material (migración 113).
 *
 * · LINEAL —rollo, cable, manguera, cadena—: se corta de la pieza ABIERTA y lo que queda
 *   sigue siendo rollo. Es la variante que la pantalla ya tenía.
 * · TUBULAR —tubo, perfil, varilla—: llega en TRAMOS de largo fijo y cada corte deja un
 *   pedazo. Se elige al revés: primero cuánto, y el sistema sugiere EL PEDAZO MÁS CHICO
 *   DONDE QUEPA —usar un tramo entero cuando sobra uno de 1.20 m para un corte de 90 cm
 *   es crear otro retazo—.
 * · PLANO —lámina, vidrio, acrílico—: el sistema no lleva geometría (§2.2), así que no
 *   sabe si un rectángulo cabe en lo que queda de una hoja: se pide la HOJA ABIERTA de
 *   donde se corta, y la medida es el ÁREA, ancho × alto, que es como se cobra.
 */

export type TipoDeCorte = 'lineal' | 'tubular' | 'plano';

export interface PiezaParaElegir {
  readonly id: string;
  readonly abierta: boolean;
  readonly restante: number;
}

export function tipoDeCorte(tipo: string | null | undefined): TipoDeCorte {
  return tipo === 'tubular' || tipo === 'plano' ? tipo : 'lineal';
}

/**
 * El pedazo más chico donde cabe el corte; entre iguales, el que ya está abierto (un
 * pedazo suelto antes que abrir un tramo nuevo). Nulo si no cabe en ninguno.
 */
export function pedazoDondeCabe<P extends PiezaParaElegir>(
  piezas: readonly P[],
  medida: number,
): P | null {
  if (!(medida > 0)) return null;
  const caben = piezas.filter((p) => p.restante >= medida);
  caben.sort((a, b) => a.restante - b.restante || Number(b.abierta) - Number(a.abierta));
  return caben[0] ?? null;
}

/** «1,20» o «1.2»: a diezmilésimas, o nulo si no es una medida. */
function diezmilesimas(texto: string): bigint | null {
  const limpio = texto.trim().replace(',', '.');
  const partes = /^(\d{1,6})(?:\.(\d{1,4}))?$/.exec(limpio);
  if (partes === null) return null;
  return BigInt(partes[1] ?? '0') * 10_000n + BigInt((partes[2] ?? '').padEnd(4, '0'));
}

/**
 * El ÁREA de un corte plano, ancho × alto, en la unidad de venta (m²) con cuatro
 * decimales y medio hacia arriba. Texto, como la manda la pantalla al servidor. Nulo si
 * alguna medida no es un número mayor que cero.
 */
export function areaDelCorte(ancho: string, alto: string): string | null {
  const a = diezmilesimas(ancho);
  const b = diezmilesimas(alto);
  if (a === null || b === null || a === 0n || b === 0n) return null;
  const area = (a * b + 5_000n) / 10_000n;
  const enteros = area / 10_000n;
  const decimales = (area % 10_000n).toString().padStart(4, '0');
  return `${enteros.toString()}.${decimales}`;
}

/**
 * DE QUÉ SE CORTA: el material que pidió el mostrador (F6), o el primero si no pidió
 * ninguno. Si pidió uno que no se vende cortado, se dice —`noEsDeCorte`— y se ofrece el
 * primero, en vez de cortar otro en silencio.
 */
export function materialParaCortar<M extends { readonly id: string }>(
  materiales: readonly M[],
  pedidoId: string | null,
): { readonly material: M | null; readonly noEsDeCorte: boolean } {
  const pedido = pedidoId === null ? undefined : materiales.find((m) => m.id === pedidoId);
  return {
    material: pedido ?? materiales[0] ?? null,
    noEsDeCorte: pedidoId !== null && pedido === undefined,
  };
}
