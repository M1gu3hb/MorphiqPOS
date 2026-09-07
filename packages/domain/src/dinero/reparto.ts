import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import type { Centavos } from './centavos.js';

/**
 * Reparte un importe en partes iguales sin perder ni inventar centavos.
 *
 * El caso real: $1.00 de propina entre 3 meseros. 100 / 3 no da entero, y las
 * dos salidas faciles estan mal:
 *
 *   - redondear cada parte a 33 deja 1 centavo sin repartir;
 *   - redondear cada parte a 34 reparte 2 centavos que nadie puso.
 *
 * Se usa el metodo del residuo mayor: todos reciben el cociente entero, y los
 * primeros `resto` reciben un centavo extra. La suma es exactamente el total,
 * siempre. La prueba lo comprueba para 201 importes x 9 divisores.
 *
 * El orden es determinista —los primeros de la lista se llevan el centavo de
 * mas— asi que quien reparte decide el orden y el resultado es auditable. No se
 * sortea: un reparto que cambia entre ejecuciones no se puede cuadrar contra un
 * corte de caja.
 *
 * Con importe negativo (una devolucion de propina) el centavo extra tambien se
 * aleja del cero, para que repartir X y repartir -X sean espejo exacto.
 */
export function repartir(monto: Centavos, partes: number): Centavos[] {
  if (!Number.isSafeInteger(partes) || partes < 1) {
    throw new ErrorDominio(
      CODIGOS_ERROR.DINERO_PARTES_INVALIDAS,
      'Un importe se reparte entre un numero entero y positivo de partes.',
      { recibido: String(partes) },
    );
  }

  const divisor = BigInt(partes);
  const signo = monto < 0n ? -1n : 1n;
  const magnitud = monto < 0n ? -monto : monto;

  const base = magnitud / divisor;
  const resto = magnitud % divisor;

  const trozos: Centavos[] = [];
  for (let i = 0n; i < divisor; i += 1n) {
    const extra = i < resto ? 1n : 0n;
    trozos.push((signo * (base + extra)) as Centavos);
  }

  return trozos;
}
