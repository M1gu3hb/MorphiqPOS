/**
 * LOS MÓDULOS QUE UN LECTOR USA PARA ORIENTARSE.
 *
 * Un QR no es sólo datos: los tres buscadores, las líneas de temporización, los patrones de
 * alineación y las franjas de formato y versión son los que le dicen al lector dónde está, qué
 * tan inclinado y qué tan grande es el código. Los datos admiten formas caprichosas porque el
 * código de corrección de errores los repone; estos no. Por eso se dibujan SIEMPRE como
 * cuadrados, sea cual sea el estilo de módulo, y por eso el logo del centro nunca los tapa.
 */

import type { MatrizQr } from './matriz.ts';

/** Lado de un buscador, en módulos. */
export const LADO_DEL_BUSCADOR = 7;

/** ¿Cae (x, y) dentro de uno de los tres buscadores? Esos los dibuja `ojos.ts`, no los módulos. */
export function estaEnBuscador(matriz: MatrizQr, x: number, y: number): boolean {
  const n = matriz.tamano;
  const lado = LADO_DEL_BUSCADOR;
  return (x < lado && y < lado) || (x >= n - lado && y < lado) || (x < lado && y >= n - lado);
}

/** ¿Está (x, y) a dos módulos o menos del centro de algún patrón de alineación? */
function enAlineacion(posiciones: readonly number[], x: number, y: number): boolean {
  const ultimo = posiciones.length - 1;
  return posiciones.some((px, i) =>
    posiciones.some((py, j) => {
      // Las tres esquinas donde caería un buscador no llevan patrón de alineación.
      const esBuscador =
        (i === 0 && j === 0) || (i === 0 && j === ultimo) || (i === ultimo && j === 0);
      return !esBuscador && Math.abs(x - px) <= 2 && Math.abs(y - py) <= 2;
    }),
  );
}

/**
 * ¿Es (x, y) un módulo que no se puede deformar? Buscadores con su separador y su formato, las
 * dos líneas de temporización (fila y columna 6), las franjas de formato (fila y columna 8), la
 * información de versión de las versiones 7 en adelante y los patrones de alineación.
 *
 * @param posiciones los centros de alineación de la versión (`posicionesDeAlineacion`). Se pasan
 *   para no recalcularlos en cada uno de los miles de módulos de un código.
 */
export function esModuloProtegido(
  matriz: MatrizQr,
  x: number,
  y: number,
  posiciones: readonly number[],
): boolean {
  const n = matriz.tamano;
  if (x === 6 || y === 6 || x === 8 || y === 8) return true;
  if ((x < 9 && y < 9) || (x >= n - 8 && y < 9) || (x < 9 && y >= n - 8)) return true;
  if (matriz.version >= 7 && ((x >= n - 11 && y < 6) || (y >= n - 11 && x < 6))) return true;
  return enAlineacion(posiciones, x, y);
}
