/** «3.6» → 360 puntos base; nulo si no es un porcentaje de 0 a 10 con hasta dos decimales. */
export function puntosBaseDe(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(limpio)) return null;
  const [entero = '0', decimal = ''] = limpio.split('.');
  const bp = Number(entero) * 100 + Number(decimal.padEnd(2, '0'));
  return bp > 1_000 ? null : bp;
}
