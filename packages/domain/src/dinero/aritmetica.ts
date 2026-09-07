import type { Centavos } from './centavos';

/**
 * Aritmetica de importes.
 *
 * Existen como funciones, y no se usa `a + b` directamente, por una razon del
 * compilador: `Centavos` lleva marca, y `a + b` devuelve `bigint` sin marca.
 * Asi, cualquier suma de dinero escrita por fuera de este modulo no compila.
 * Es la version en tipos de la regla "hay un solo lugar donde se calcula un
 * total" (senal de desviacion 4 de `04-ARQUITECTURA §9`).
 *
 * Aqui solo vive lo que ya tiene prueba (R17). Multiplicar por una cantidad
 * fraccionaria —1.235 kg de jamon— NO esta: eso necesita el modulo de
 * cantidades, que llega con la venta por peso en F1.2. Resolverlo hoy con un
 * `number` reintroduciria el punto flotante por la puerta de atras.
 */

/** Suma cualquier cantidad de importes. Sin argumentos devuelve cero, no NaN. */
export function sumar(...montos: readonly Centavos[]): Centavos {
  let total = 0n;
  for (const monto of montos) total += monto;
  return total as Centavos;
}

export function restar(minuendo: Centavos, sustraendo: Centavos): Centavos {
  return (minuendo - sustraendo) as Centavos;
}

export function negar(monto: Centavos): Centavos {
  return -monto as Centavos;
}

/** -1 si a < b, 0 si son iguales, 1 si a > b. Sirve para ordenar. */
export function comparar(a: Centavos, b: Centavos): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
