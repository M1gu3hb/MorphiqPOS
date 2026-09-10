'use client';

/**
 * Pesos ↔ centavos, en un solo sitio.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * Las pantallas de Miguel trabajan en PESOS con `Number` (los inputs son
 * `parseFloat`, y `formatCurrency` formatea pesos). Los comandos —`caja.abrir`,
 * `caja.cerrar`, `venta.cobrar`— sólo aceptan CENTAVOS ENTEROS
 * (`z.number().int()`), porque un importe en punto flotante no existe exacto:
 * `11.80 * 100` da `1179.9999999999998` y un `Math.trunc` se comería un centavo
 * por ticket. Aquí se redondea UNA vez, en un solo lugar, y no en cada llamada.
 *
 * No se toca ninguna cifra en pantalla: esto sólo traduce en la frontera con el
 * servidor, y de vuelta para enseñar lo que el servidor decidió.
 */

/** Pesos (número o cadena del input) → centavos enteros. */
export function aCentavos(pesos) {
  const n = typeof pesos === 'number' ? pesos : Number.parseFloat(String(pesos ?? ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Centavos del servidor (llegan como texto: un `bigint` no cabe en `number`). */
export function aPesos(centavos) {
  const n = typeof centavos === 'number' ? centavos : Number.parseFloat(String(centavos ?? ''));
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}
