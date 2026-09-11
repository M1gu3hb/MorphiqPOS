/**
 * Las conversiones que necesita la respuesta pública.
 *
 * ── Por qué salen las DOS cosas: los centavos y los pesos ─────────────────
 * `aPesos` devuelve coma flotante, y eso es lo que su frontend lee hoy
 * (`PortalCliente.jsx:934`, `PedirCuentaQR.jsx:480`, vía `formatCurrency`).
 * Mientras esas pantallas existan, quitarlo rompería el menú; y `apps/web/
 * heredado` no es mío.
 *
 * Pero el número flotante NO puede ser la única fuente: esta respuesta es de la
 * que su navegador SUMA, y sumar `0.1 + 0.2` en el teléfono da un total que el
 * servidor nunca dijo. Por eso cada importe viaja también como su entero de
 * centavos —en cadena, que es como un `bigint` sobrevive a `JSON.stringify`—.
 * El flotante es para PINTAR; el entero es para SUMAR (R15).
 *
 * Es la misma pareja de conversiones que hace `haciaEl` en el puente
 * (`puente/tipos.ts:184`): si divergieran, un producto costaría distinto en el
 * menú QR y en la pantalla del mesero, y nadie sabría cuál de las dos miente.
 */

const CENTAVOS_POR_PESO = 100;

/** De `bigint` de centavos a los pesos decimales que lee su frontend. */
export function aPesos(centavos: bigint | number | null): number | null {
  return centavos === null ? null : Number(centavos) / CENTAVOS_POR_PESO;
}

/**
 * El importe EXACTO, en centavos, como cadena.
 *
 * Nunca `Number(...)`: un `bigint` que pasa por `number` deja de ser exacto en
 * cuanto crece, y aquí el dato existe precisamente para poder sumarse sin
 * perder un centavo.
 */
export function aCentavos(centavos: bigint | null): string | null {
  return centavos === null ? null : centavos.toString();
}

/** `numeric` de Postgres llega como cadena; su frontend espera número. */
export function aNumero(valor: string | number | null): number | null {
  return valor === null ? null : Number(valor);
}
