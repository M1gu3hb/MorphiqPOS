import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-151 · La doble unidad: se COMPRA por kilo y se VENDE por pieza.
 *
 * ── El caso que no resuelve ningún otro modelo ───────────────────────────
 * El tornillo entra al almacén en un costal de 25 kg y sale del mostrador de
 * tres en tres. No es una presentación —la caja de 100 sí lo es—: es que las
 * dos unidades miden cosas distintas del mismo producto, y el negocio necesita
 * las dos. Sin la conversión, el kilo entra al inventario y las piezas salen, y
 * al tercer mes la existencia dice 12 kg donde hay dos puños.
 *
 * ── Todo en MILIGRAMOS enteros ───────────────────────────────────────────
 * El tornillo de 5 g es 5000. Un `numeric` con decimales volvería a meter punto
 * flotante en una cuenta que después se multiplica por 1,400 piezas, y el
 * redondeo acumulado ahí ya no es un gramo: son dos kilos al año. Misma
 * decisión que los centavos, llevada al peso.
 *
 * ── Contar pesando NO es contar ──────────────────────────────────────────
 * Es estimar, y la estimación tiene un error que hay que decir en voz alta. Por
 * eso `contarPorPeso` no devuelve un número: devuelve un número CON su rango de
 * confianza y con la señal de si cae dentro de la tolerancia del producto. Un
 * conteo por báscula que se presenta como exacto es peor que no contar: el
 * ajuste entra al kardex como si alguien hubiera contado pieza por pieza.
 */

export interface PesoDePieza {
  /** Cuánto pesa UNA pieza, en miligramos enteros. */
  readonly miligramos: bigint;
  /**
   * Cuánto puede desviarse el peso real del esperado, en puntos base.
   *
   * Es por producto porque un tornillo estampado varía poco y una pija de tres
   * pulgadas mucho más: una tolerancia única o no avisa nunca o avisa siempre.
   */
  readonly toleranciaBp: number;
}

export interface ConteoPorPeso {
  /** La estimación central, en piezas enteras. */
  readonly piezas: number;
  /** El rango que la tolerancia admite: de cuántas a cuántas puede ser. */
  readonly minimo: number;
  readonly maximo: number;
  /**
   * `false` cuando el rango es tan ancho que el conteo no distingue una pieza
   * de la siguiente. Entonces hay que contar a mano, y la pantalla lo dice.
   */
  readonly confiable: boolean;
}

const PUNTOS_BASE_100 = 10_000n;

function exigirPeso(peso: PesoDePieza): void {
  if (peso.miligramos <= 0n) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'El peso por pieza tiene que ser mayor que cero: sin él no hay conversión.',
    );
  }
  if (!Number.isInteger(peso.toleranciaBp) || peso.toleranciaBp < 0 || peso.toleranciaBp > 10_000) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'La tolerancia va en puntos base, de 0 a 10 000.',
    );
  }
}

/**
 * F-151 · Cuántas piezas son estos miligramos.
 *
 * Trunca hacia abajo a propósito: media pieza no existe, y redondear hacia
 * arriba metería al inventario una pieza que no está. Lo que sobra es la merma
 * del costal, y tiene su propio renglón.
 */
export function piezasDesdePeso(miligramos: bigint, peso: PesoDePieza): bigint {
  exigirPeso(peso);
  if (miligramos < 0n) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'Un peso negativo no es una entrada de almacén.');
  }
  return miligramos / peso.miligramos;
}

/** F-151 · Y la vuelta: cuánto pesan estas piezas. Es lo que se le paga al proveedor. */
export function pesoDesdePiezas(piezas: bigint, peso: PesoDePieza): bigint {
  exigirPeso(peso);
  if (piezas < 0n) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'Un número de piezas negativo no es una salida.');
  }
  return piezas * peso.miligramos;
}

/**
 * F-151 · Contar pesando, DICIENDO el error.
 *
 * El rango sale de la tolerancia del producto: si cada pieza puede pesar entre
 * `p·(1−t)` y `p·(1+t)`, entonces el mismo peso total puede ser desde
 * `total/(p·(1+t))` hasta `total/(p·(1−t))` piezas.
 *
 * Y se marca como NO confiable cuando el rango abarca más de una pieza por cada
 * diez estimadas: a partir de ahí la báscula no distingue 47 de 52, y presentar
 * «47» como un conteo sería meter al kardex un ajuste inventado.
 */
export function contarPorPeso(miligramosTotales: bigint, peso: PesoDePieza): ConteoPorPeso {
  exigirPeso(peso);
  if (miligramosTotales < 0n) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'Un peso negativo no se puede contar.');
  }

  const tolerancia = BigInt(peso.toleranciaBp);
  const pesado = peso.miligramos;
  const pesoMaximo = (pesado * (PUNTOS_BASE_100 + tolerancia)) / PUNTOS_BASE_100;
  const pesoMinimo = (pesado * (PUNTOS_BASE_100 - tolerancia)) / PUNTOS_BASE_100;

  const piezas = Number(miligramosTotales / pesado);
  const minimo = Number(miligramosTotales / pesoMaximo);
  // Con tolerancia del 100 % el peso mínimo por pieza sería cero: se acota para
  // no dividir entre cero, y el conteo sale marcado como no confiable igual.
  const maximo =
    pesoMinimo === 0n ? Number.MAX_SAFE_INTEGER : Number(miligramosTotales / pesoMinimo);

  // Una pieza de holgura por cada diez estimadas. Por debajo de diez piezas el
  // umbral es de una: contar doce a ojo es más rápido que discutir la báscula.
  const holguraAdmitida = Math.max(1, Math.floor(piezas / 10));
  return { piezas, minimo, maximo, confiable: maximo - minimo <= holguraAdmitida };
}
