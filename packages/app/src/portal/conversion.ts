/**
 * Las dos conversiones que necesita la respuesta pública.
 *
 * Son las MISMAS que hace `haciaEl` en el puente. Si divergieran, un producto
 * costaría distinto en el menú QR y en la pantalla del mesero, y nadie sabría
 * cuál de las dos miente.
 */

const CENTAVOS_POR_PESO = 100;

/** De `bigint` de centavos a los pesos decimales que lee su frontend. */
export function aPesos(centavos: bigint | number | null): number | null {
  return centavos === null ? null : Number(centavos) / CENTAVOS_POR_PESO;
}

/** `numeric` de Postgres llega como cadena; su frontend espera número. */
export function aNumero(valor: string | number | null): number | null {
  return valor === null ? null : Number(valor);
}
