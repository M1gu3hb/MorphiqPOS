import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import { type Centavos } from './centavos';
import { redondear } from './redondeo';

/**
 * Las dos fronteras del dinero: texto que entra y texto que sale.
 *
 * Todo lo que llega de un formulario, de un CSV o de una API entra por
 * `desdeTexto`. Todo lo que se le muestra a una persona sale por `formatear`.
 * En medio, solo `Centavos`.
 *
 * Ninguna de las dos usa `Number` con decimales. Ese es el punto: `1.005` en
 * punto flotante es `1.00499999999999989`, asi que `Math.round(1.005 * 100)`
 * devuelve 100 en vez de 101. Aqui se cuenta con digitos y con `bigint`, y ese
 * error no existe.
 */

/** Monedas soportadas en Fase 1. R15 exige que la moneda sea explicita. */
export const MONEDAS = {
  MXN: { simbolo: '$', decimales: 2 },
} as const;

export type Moneda = keyof typeof MONEDAS;

/** Importe valido: signo opcional, enteros con separador de miles opcional,
 *  parte decimal opcional. Se acepta el simbolo de pesos porque los cajeros
 *  pegan importes copiados de otro lado. */
const IMPORTE = /^(?<signo>[+-]?)\$?(?<entero>\d{1,3}(?:,\d{3})*|\d+)(?:\.(?<decimal>\d+))?$/;

/**
 * Convierte un texto de pesos a centavos, redondeando con la regla unica del
 * sistema (ROUND_HALF_UP, alejandose del cero).
 *
 * Acepta mas de dos decimales y redondea: `19.999` son 2000 centavos. Rechaza
 * cualquier cosa que no sea un importe **en vez de devolver cero**, que es como
 * una venta termina cobrando de menos sin que nadie se entere (R12).
 */
export function desdeTexto(texto: string, moneda: Moneda = 'MXN'): Centavos {
  const limpio = texto.trim().replaceAll(' ', '');
  const coincidencia = IMPORTE.exec(limpio);

  if (!coincidencia?.groups) {
    throw new ErrorDominio(
      CODIGOS_ERROR.DINERO_TEXTO_INVALIDO,
      'El texto no representa un importe.',
      { recibido: texto },
    );
  }

  const { signo, entero, decimal } = coincidencia.groups;
  const digitosEnteros = (entero ?? '').replaceAll(',', '');
  const digitosDecimales = decimal ?? '';

  const { decimales } = MONEDAS[moneda];
  const escala = 10n ** BigInt(decimales);

  // Se arma el importe como una fraccion exacta y se redondea una sola vez:
  //   valor = (entero . decimal) * escala
  // Ejemplo con "1.005": numerador = 1005 * 100, denominador = 1000  ->  100.5
  const denominador = 10n ** BigInt(digitosDecimales.length);
  const numerador = BigInt(`${digitosEnteros}${digitosDecimales}` || '0') * escala;

  const magnitud = redondear(numerador, denominador);
  return (signo === '-' ? -magnitud : magnitud) as Centavos;
}

/**
 * Convierte centavos a texto para una persona, con la moneda explicita.
 *
 * El signo va delante del simbolo (`-$45.50`) porque es como se lee un
 * reembolso en un ticket mexicano.
 */
export function formatear(monto: Centavos, moneda: Moneda): string {
  const { simbolo, decimales } = MONEDAS[moneda];
  const escala = 10n ** BigInt(decimales);

  const negativo = monto < 0n;
  const magnitud = negativo ? -monto : monto;

  const enteros = magnitud / escala;
  const fraccion = magnitud % escala;

  const conMiles = enteros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraccionRellena = fraccion.toString().padStart(decimales, '0');

  return `${negativo ? '-' : ''}${simbolo}${conMiles}.${fraccionRellena}`;
}
