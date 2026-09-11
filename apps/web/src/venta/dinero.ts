/**
 * Dinero en el navegador: se FORMATEA, nunca se calcula.
 *
 * Los importes llegan del servidor como cadenas de centavos —no como `number`—
 * porque un total por encima de `Number.MAX_SAFE_INTEGER` se redondearía en el
 * `JSON.parse` y nadie lo notaría hasta que un arqueo no cuadre. Aquí sólo se
 * les pone forma para leerlos.
 *
 * **No hay una sola suma en este archivo.** Sumar en el cliente sería la
 * primera grieta de «precios y totales siempre en el servidor».
 */

const FORMATO = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

/** `'123456'` → `'$1,234.56'`. */
export function pesos(centavos: string): string {
  const valor = BigInt(centavos);
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;
  const entero = absoluto / 100n;
  const resto = absoluto % 100n;
  const texto = FORMATO.format(Number(entero) + Number(resto) / 100);
  return negativo ? `−${texto}` : texto;
}

/** `'$1,234.56'` en dígitos tabulares: los importes de una columna no bailan. */
export const CLASE_IMPORTE = 'tabular-nums';

/** `'2.5'` → `'2.5'`; `'3.0000'` → `'3'`. Quita ceros de relleno de numeric(14,4). */
export function cantidadLegible(cantidad: string): string {
  if (!cantidad.includes('.')) return cantidad;
  return cantidad.replace(/\.?0+$/, '');
}

/** De pesos tecleados a centavos enteros, sin punto flotante. */
export function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(/[^\d.]/g, '');
  if (limpio === '' || !/^\d*(\.\d{0,2})?$/.test(limpio)) return null;
  const [entera = '0', decimal = ''] = limpio.split('.');
  return Number(entera || '0') * 100 + Number(decimal.padEnd(2, '0').slice(0, 2));
}
