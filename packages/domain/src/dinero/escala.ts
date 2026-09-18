import { centavos, type Centavos } from './centavos.ts';

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
 *
 * ── Por qué vive en el dominio y no en `app/venta` ─────────────────────────
 * Porque es aritmética de dinero pura, y desde F-324 la necesitan dos capas: el
 * cobro, para escalar un costo unitario, y la anulación parcial, para partir
 * una línea de 0.350 kg sin que la mitad anulada y la mitad viva dejen de sumar
 * lo que sumaba la línea. `app/venta/escala.ts` sigue existiendo y reexporta
 * esto: los diecisiete sitios que ya la importaban no se tocan, y su prueba
 * —que no se modificó— es la que demuestra que el traslado no cambió nada.
 */

export const ESCALA_CANTIDAD = 10_000n;

/** `'0.350'` → `3500n`. Exacta: nunca pasa por `Number`. */
export function aDiezmilesimas(cantidad: string): bigint {
  const negativa = cantidad.startsWith('-');
  const limpia = negativa ? cantidad.slice(1) : cantidad;
  const [entera = '0', decimal = ''] = limpia.split('.');
  const valor =
    BigInt(entera || '0') * ESCALA_CANTIDAD + BigInt(decimal.padEnd(4, '0').slice(0, 4));
  return negativa ? -valor : valor;
}

/** `3500n` → `'0.3500'`, en la forma que `numeric(14,4)` acepta de vuelta. */
export function deDiezmilesimas(valor: bigint): string {
  const negativa = valor < 0n;
  const absoluto = negativa ? -valor : valor;
  const entera = absoluto / ESCALA_CANTIDAD;
  const decimal = (absoluto % ESCALA_CANTIDAD).toString().padStart(4, '0');
  return `${negativa ? '-' : ''}${entera.toString()}.${decimal}`;
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
