/**
 * MATRICES PARA LAS PRUEBAS. No se usa fuera de ellas.
 *
 * El dominio no tiene codificador, así que las pruebas fabrican matrices con la ESTRUCTURA de un
 * QR real —tres buscadores con su separador, las dos líneas de temporización, los patrones de
 * alineación que corresponden a la versión— y el resto relleno de forma pseudoaleatoria pero
 * repetible. No codifican nada y ningún lector las leería; sirven para que el dibujo tenga
 * módulos protegidos, vecinos oscuros y claros, y esquinas con las que tropezar.
 */

import {
  matrizDesdeFilas,
  posicionesDeAlineacion,
  tamanoDeVersion,
  type MatrizQr,
} from './matriz.ts';

/** Generador pseudoaleatorio con semilla (mulberry32): mismo número de entrada, misma secuencia. */
function aleatorioConSemilla(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let mezcla = Math.imul(estado ^ (estado >>> 15), estado | 1);
    mezcla ^= mezcla + Math.imul(mezcla ^ (mezcla >>> 7), mezcla | 61);
    return ((mezcla ^ (mezcla >>> 14)) >>> 0) / 4294967296;
  };
}

type Rejilla = boolean[][];

function poner(filas: Rejilla, x: number, y: number, oscuro: boolean): void {
  const fila = filas[y];
  if (fila !== undefined && x >= 0 && x < fila.length) fila[x] = oscuro;
}

/** Distancia de «tablero de ajedrez» (la del rey): el mayor de los dos desplazamientos. */
const distancia = (dx: number, dy: number): number => Math.max(Math.abs(dx), Math.abs(dy));

function dibujarBuscador(filas: Rejilla, x0: number, y0: number): void {
  // El separador claro de 8 × 8 va debajo del buscador de 7 × 7.
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) poner(filas, x0 + dx, y0 + dy, false);
  }
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) poner(filas, x0 + dx, y0 + dy, distancia(dx - 3, dy - 3) !== 2);
  }
}

function dibujarAlineacion(filas: Rejilla, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) poner(filas, cx + dx, cy + dy, distancia(dx, dy) !== 1);
  }
}

/** Una matriz de la versión dada con la estructura de un QR y datos pseudoaleatorios. */
export function matrizSintetica(version: number, semilla = 1): MatrizQr {
  const n = tamanoDeVersion(version);
  const azar = aleatorioConSemilla(semilla);
  const filas: Rejilla = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => azar() < 0.5),
  );
  for (let i = 8; i < n - 8; i++) {
    poner(filas, i, 6, i % 2 === 0);
    poner(filas, 6, i, i % 2 === 0);
  }
  for (const [x, y] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const)
    dibujarBuscador(filas, x, y);
  const posiciones = posicionesDeAlineacion(version);
  const ultimo = posiciones.length - 1;
  for (const [i, px] of posiciones.entries()) {
    for (const [j, py] of posiciones.entries()) {
      const esquinaDeBuscador =
        (i === 0 && j === 0) || (i === 0 && j === ultimo) || (i === ultimo && j === 0);
      if (!esquinaDeBuscador) dibujarAlineacion(filas, px, py);
    }
  }
  return matrizDesdeFilas(filas, version);
}

/** Una matriz de la versión dada con SÓLO los módulos indicados oscuros. */
export function matrizConModulos(
  version: number,
  oscuros: readonly (readonly [number, number])[],
): MatrizQr {
  const n = tamanoDeVersion(version);
  const filas: Rejilla = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
  for (const [x, y] of oscuros) poner(filas, x, y, true);
  return matrizDesdeFilas(filas, version);
}
