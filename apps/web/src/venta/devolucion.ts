/**
 * LA CUENTA DE LA DEVOLUCIÓN EN LA PANTALLA (D-29 de la 2.4): la misma regla que
 * `venta.devolver_venta`, para enseñar ANTES de confirmar cuánto sale.
 *
 * El servidor manda —recalcula y es su importe el que se devuelve—; esto sólo evita
 * decirle al cliente un número y devolverle otro. Por eso es la MISMA cuenta, no una
 * aproximación: lo cobrado de la línea por la fracción acumulada, redondeado la mitad
 * hacia arriba, menos lo que ya se había devuelto.
 */

const ESCALA = 10_000n;

/** «3.0000» o «1.5» a diezmilésimas; `null` si no es una cantidad. */
export function diezmilesimasDe(texto: string): bigint | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d{1,10}(?:\.\d{1,4})?$/.test(limpio)) return null;
  const [entero = '0', decimal = ''] = limpio.split('.');
  return BigInt(entero) * ESCALA + BigInt(decimal.padEnd(4, '0'));
}

/** La única regla de redondeo del dominio: la mitad se aleja del cero. */
function redondear(numerador: bigint, denominador: bigint): bigint {
  const cociente = numerador / denominador;
  return (numerador % denominador) * 2n >= denominador ? cociente + 1n : cociente;
}

export interface LineaParaDevolver {
  readonly ordenLineaId: string;
  readonly producto: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly devuelta: string;
  readonly cobradoCentavos: string;
  readonly devueltoCentavos: string;
}

/** Lo que todavía se puede devolver de una línea, como texto para el campo. */
export function pendienteDe(linea: LineaParaDevolver): string {
  const vendida = diezmilesimasDe(linea.cantidad) ?? 0n;
  const devuelta = diezmilesimasDe(linea.devuelta) ?? 0n;
  const queda = vendida - devuelta;
  const enteros = queda / ESCALA;
  const decimales = queda % ESCALA;
  return decimales === 0n
    ? String(enteros)
    : `${String(enteros)}.${String(decimales).padStart(4, '0').replace(/0+$/, '')}`;
}

/**
 * Cuánto se devuelve de una línea por `cantidad`, o `null` si la cantidad no es válida o
 * pasa de lo que queda.
 */
export function importeDeLinea(linea: LineaParaDevolver, cantidad: string): bigint | null {
  const vendida = diezmilesimasDe(linea.cantidad);
  const antes = diezmilesimasDe(linea.devuelta);
  const ahora = diezmilesimasDe(cantidad);
  if (vendida === null || antes === null || ahora === null || vendida === 0n) return null;
  if (antes + ahora > vendida) return null;
  const cobrado = BigInt(linea.cobradoCentavos);
  return redondear(cobrado * (antes + ahora), vendida) - redondear(cobrado * antes, vendida);
}

/** Un tope en puntos base como se lee: 1000 → «10», 1250 → «12.5». */
export function porcentajeDeTope(puntosBase: number): string {
  const enteros = Math.trunc(puntosBase / 100);
  const resto = puntosBase % 100;
  return resto === 0
    ? String(enteros)
    : `${String(enteros)}.${String(resto).padStart(2, '0').replace(/0$/, '')}`;
}
