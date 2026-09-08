import { centavos, type Centavos } from '@morphiqpos/domain/dinero';

/**
 * Multiplicar un importe por una cantidad decimal, sin punto flotante.
 *
 * `numeric(14,4)` en la base son diezmilésimas. La tentación es
 * `Number(cantidad) * costo`, y falla de dos maneras distintas:
 *
 *   · `Math.trunc(Number('0.5'))` es 0 — media res costaría cero;
 *   · `0.1 + 0.2` no es `0.3`, y el error se acumula venta a venta hasta que el
 *     margen del reporte no cuadra con la suma de los tickets.
 *
 * Aquí todo es `bigint`: la cantidad se escala a diezmilésimas, se multiplica y
 * se redondea al centavo medio hacia arriba, igual que `redondear` del dominio.
 */

export const ESCALA_CANTIDAD = 10_000n;

export function aDiezmilesimas(cantidad: string): bigint {
  const negativa = cantidad.startsWith('-');
  const limpia = negativa ? cantidad.slice(1) : cantidad;
  const [entera = '0', decimal = ''] = limpia.split('.');
  const valor =
    BigInt(entera || '0') * ESCALA_CANTIDAD + BigInt(decimal.padEnd(4, '0').slice(0, 4));
  return negativa ? -valor : valor;
}

/** `importeUnitario × cantidad`, redondeado al centavo. */
export function porCantidad(importeUnitario: bigint, cantidad: string): Centavos {
  const escalada = aDiezmilesimas(cantidad);
  const producto = importeUnitario * escalada;
  const negativo = producto < 0n;
  const absoluto = negativo ? -producto : producto;
  const redondeado = (absoluto * 2n + ESCALA_CANTIDAD) / (ESCALA_CANTIDAD * 2n);
  return centavos(negativo ? -redondeado : redondeado);
}
