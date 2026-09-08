import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * Un importe, en centavos, como entero exacto.
 *
 * R15 — "El dinero se maneja en unidades menores enteras o decimal exacto".
 * Aqui es `bigint`: no hay fraccion de centavo, no hay deriva, y no existe la
 * clase entera de errores donde 0.1 + 0.2 no da 0.3.
 *
 * El tipo lleva marca para que el compilador impida mezclarlo con un `bigint`
 * cualquiera. Las operaciones aritmeticas de TypeScript (`a + b`) devuelven
 * `bigint` sin marca, asi que no compilan donde se espera `Centavos`: hay que
 * pasar por `sumar`, `restar` y compania. Eso es a proposito — es lo que
 * garantiza que todo el dinero del sistema pase por este modulo.
 *
 * Sobre la moneda: en Fase 1 una organizacion opera en una sola moneda, y el
 * modelo de datos (`03-MODELO`) no tiene columna de moneda. La parte de R15 que
 * pide "moneda explicita" se cumple en las fronteras: `formatear` la exige
 * siempre. Mezclar monedas dentro de una misma orden esta fuera del alcance de
 * Fase 1 y necesitaria llevar la moneda en cada importe.
 */
export type Centavos = bigint & { readonly __marca: 'Centavos' };

/**
 * Construye un importe a partir de un entero.
 *
 * Acepta `bigint` o un `number` **entero**. Un `number` con decimales se
 * rechaza: seria admitir que existe media unidad de centavo, que es justo la
 * puerta por la que entra el error de redondeo.
 */
export function centavos(valor: bigint | number): Centavos {
  if (typeof valor === 'bigint') {
    return valor as Centavos;
  }

  if (!Number.isFinite(valor)) {
    throw new ErrorDominio(
      CODIGOS_ERROR.DINERO_NO_ENTERO,
      'Un importe no puede ser NaN ni infinito.',
      { recibido: String(valor) },
    );
  }

  if (!Number.isSafeInteger(valor)) {
    throw new ErrorDominio(
      CODIGOS_ERROR.DINERO_NO_ENTERO,
      'Un importe en centavos debe ser un entero seguro. ' +
        'Si vienes de un texto o de un calculo con decimales, usa desdeTexto o redondear.',
      { recibido: String(valor) },
    );
  }

  return BigInt(valor) as Centavos;
}

/** El importe cero. */
export const CERO: Centavos = 0n as Centavos;

export function esCero(monto: Centavos): boolean {
  return monto === CERO;
}

export function esNegativo(monto: Centavos): boolean {
  return monto < 0n;
}

/**
 * Valor absoluto. La diferencia de un corte de caja y un abono a fiado se
 * presentan con el mismo formato aunque uno sea negativo.
 */
export function absoluto(monto: Centavos): Centavos {
  return (monto < 0n ? -(monto as bigint) : monto) as Centavos;
}
