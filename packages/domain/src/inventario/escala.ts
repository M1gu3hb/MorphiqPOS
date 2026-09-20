import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { ESCALA_CANTIDAD } from '../catalogo/cantidades.ts';

/**
 * Cantidades CON SIGNO, en la escala exacta de `numeric(14,4)`.
 *
 * ── Por qué no valen `cantidad()` ni `cantidadATexto()` ────────────────────
 * Las dos son del catálogo, donde una cantidad es lo que se vende y por tanto
 * nunca es negativa. En el inventario la mitad de los números son negativos: una
 * salida, un faltante de conteo, una merma, un traspaso que sale. Y además
 * `cantidadATexto` recorta los ceros de la derecha, que está bien para enseñar
 * un precio y mal para comparar contra una columna `numeric(14,4)`.
 *
 * Esto vivía privado dentro de `conteo.ts`. Lo necesitan ya el conteo, el kardex
 * y la merma, y tres copias de una conversión de escala es exactamente como se
 * descubre, seis meses después, que una de las tres redondeaba distinto.
 */

const MAXIMO = 99_999_999_999_999n;

/**
 * `-40000n` → `'-4.0000'`. Los cuatro decimales van SIEMPRE.
 *
 * El texto se compara y se escribe contra `numeric(14,4)`: recortar los ceros
 * haría que `'4'` y `'4.0000'` fueran dos cadenas distintas para el mismo
 * número, y una de las dos comparaciones fallaría sin que nadie supiera por qué.
 */
export function enEscalaCompleta(valor: bigint): string {
  const negativo = valor < 0n;
  const magnitud = negativo ? -valor : valor;
  if (magnitud > MAXIMO) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'La cantidad está fuera del rango de inventario.');
  }
  const enteros = magnitud / ESCALA_CANTIDAD;
  const fraccion = (magnitud % ESCALA_CANTIDAD).toString().padStart(4, '0');
  return `${negativo ? '-' : ''}${enteros.toString()}.${fraccion}`;
}

/**
 * `'-4.5'` → `-45000n`. La inversa, y también con signo.
 *
 * Acepta de uno a cuatro decimales porque eso es lo que Postgres devuelve de un
 * `numeric(14,4)` según cómo se haya escrito, y rechaza el quinto en vez de
 * truncarlo: un truncamiento silencioso en una cantidad de inventario es una
 * diferencia que aparece en el conteo y que nadie sabe explicar.
 */
export function deEscalaCompleta(texto: string): bigint {
  const limpio = texto.trim();
  if (!/^-?\d{1,14}(?:\.\d{1,4})?$/.test(limpio)) {
    throw new ErrorDominio(
      'CANTIDAD_INVALIDA',
      `«${texto}» no es una cantidad de inventario: usa hasta cuatro decimales.`,
    );
  }
  const negativo = limpio.startsWith('-');
  const sinSigno = negativo ? limpio.slice(1) : limpio;
  const [entero = '0', decimal = ''] = sinSigno.split('.');
  const magnitud = BigInt(entero) * ESCALA_CANTIDAD + BigInt(decimal.padEnd(4, '0'));
  if (magnitud > MAXIMO) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'La cantidad está fuera del rango de inventario.');
  }
  return negativo ? -magnitud : magnitud;
}
