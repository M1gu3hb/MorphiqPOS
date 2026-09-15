import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import type { Centavos } from './centavos.ts';

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
  const magnitud = monto < 0n ? -(monto as bigint) : monto;

  const base = magnitud / divisor;
  const resto = magnitud % divisor;

  const trozos: Centavos[] = [];
  for (let i = 0n; i < divisor; i += 1n) {
    const extra = i < resto ? 1n : 0n;
    trozos.push((signo * (base + extra)) as Centavos);
  }

  return trozos;
}

/**
 * Reparte un importe entre partes de PESO DISTINTO, sin perder ni inventar
 * centavos.
 *
 * Es el hermano de `repartir` para cuando las partes no son iguales: cuatro
 * cervezas de una misma línea, dos para uno y una para cada otro; o la mitad de
 * un platillo que se anula y la mitad que se queda. `repartir(monto, 3)` no
 * sirve ahí, y multiplicar por una fracción en coma flotante tampoco: 22000 *
 * (2/4) sale bien y 43700 * (1/3) no.
 *
 * Método del residuo mayor, con el índice como desempate. El desempate importa
 * tanto como el método: sin él, dos ejecuciones del mismo reparto podrían dar
 * resultados distintos y una división de cuenta no se podría cuadrar contra el
 * corte de la noche.
 *
 * Igual que `repartir`, con importe negativo el centavo extra se aleja del
 * cero, para que repartir X y repartir -X sean espejo exacto.
 */
export function repartirPorPesos(monto: Centavos, pesos: readonly number[]): Centavos[] {
  if (pesos.length === 0) return [];
  for (const peso of pesos) {
    if (!Number.isSafeInteger(peso) || peso < 0) {
      throw new ErrorDominio(
        CODIGOS_ERROR.DINERO_PARTES_INVALIDAS,
        'Cada peso de un reparto es un entero no negativo.',
        { recibido: String(peso) },
      );
    }
  }

  const total = pesos.reduce((a, b) => a + b, 0);
  if (total === 0) return pesos.map(() => 0n as Centavos);

  const divisor = BigInt(total);
  const signo = monto < 0n ? -1n : 1n;
  const magnitud = monto < 0n ? -(monto as bigint) : (monto as bigint);

  const base = pesos.map((p) => (magnitud * BigInt(p)) / divisor);
  // El residuo que dejó la división truncada, y de quién es cada trozo de él.
  const residuos = pesos.map((p, i) => ({ i, resto: (magnitud * BigInt(p)) % divisor }));
  let sobrante = magnitud - base.reduce((a, b) => a + b, 0n);

  // Mayor residuo primero; a igualdad, el de menor índice. Sin el segundo
  // criterio el orden lo decidiría el algoritmo de ordenación del motor.
  residuos.sort((a, b) => (a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1));

  const salida = [...base];
  for (const { i } of residuos) {
    if (sobrante <= 0n) break;
    salida[i] = (salida[i] ?? 0n) + 1n;
    sobrante -= 1n;
  }

  return salida.map((trozo) => (signo * trozo) as Centavos);
}
