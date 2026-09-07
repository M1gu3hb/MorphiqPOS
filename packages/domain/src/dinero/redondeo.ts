import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import type { Centavos } from './centavos.js';

/**
 * La UNICA definicion de redondeo del sistema.
 *
 * `04-ARQUITECTURA §3` — "El redondeo se define una vez (ROUND_HALF_UP sobre
 * centavos)". Dos definiciones distintas de redondeo son dos totales distintos
 * para la misma venta, y eso es un descuadre de caja que nadie sabe explicar.
 *
 * ROUND_HALF_UP aqui significa **la mitad se aleja del cero**:
 *
 *     2.5  ->  3        -2.5  ->  -3
 *     2.4  ->  2        -2.4  ->  -2
 *
 * Se elige alejarse del cero, y no "siempre hacia arriba", para que un
 * reembolso de 2.5 y un cargo de 2.5 den la misma cantidad con signo opuesto.
 * Si redondearan distinto, una venta y su devolucion no se cancelarian y
 * quedaria un centavo colgado en los reportes.
 */
export function redondear(numerador: bigint, denominador: bigint): Centavos {
  if (denominador === 0n) {
    throw new ErrorDominio(
      CODIGOS_ERROR.DINERO_DIVISOR_CERO,
      'No se puede redondear una division entre cero.',
      { numerador: String(numerador) },
    );
  }

  // Se trabaja con magnitudes y se le devuelve el signo al final: asi la regla
  // "la mitad se aleja del cero" sale sola, sin ramas por signo.
  const signo = (numerador < 0n) !== (denominador < 0n) ? -1n : 1n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;

  const cociente = n / d;
  const resto = n % d;

  // resto * 2 >= d  equivale a  resto/d >= 0.5, sin dividir y sin decimales.
  const sube = resto * 2n >= d;

  return (signo * (sube ? cociente + 1n : cociente)) as Centavos;
}

/** 10 000 puntos base = 100 %. Se usan enteros para que el porcentaje tampoco
 *  pase nunca por punto flotante: 16 % es 1600, no 0.16. */
export const PUNTOS_BASE_100 = 10_000;

/**
 * Aplica un porcentaje expresado en puntos base, redondeando con `redondear`.
 *
 * El IVA mexicano del 16 % son 1600 puntos base. Un descuento del 12.5 % son
 * 1250. El modelo de datos guarda los margenes igual, en `margen_bp`.
 */
export function aplicarPorcentaje(monto: Centavos, puntosBase: number): Centavos {
  if (!Number.isSafeInteger(puntosBase)) {
    throw new ErrorDominio(
      CODIGOS_ERROR.DINERO_PORCENTAJE_INVALIDO,
      'Un porcentaje se expresa en puntos base enteros: 16 % es 1600, no 0.16 ni 16.5.',
      { recibido: String(puntosBase) },
    );
  }

  return redondear(monto * BigInt(puntosBase), BigInt(PUNTOS_BASE_100));
}
