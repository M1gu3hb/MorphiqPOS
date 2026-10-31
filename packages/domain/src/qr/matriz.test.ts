import { describe, expect, it } from 'vitest';

import { matrizSintetica } from './matriz-sintetica.ts';
import {
  matrizDesdeFilas,
  posicionesDeAlineacion,
  tamanoDeVersion,
  VERSION_MAXIMA,
} from './matriz.ts';

/**
 * LA MATRIZ DE UN QR Y LOS PATRONES DE ALINEACIÓN.
 *
 * El dibujo no sabe codificar: recibe la matriz. De ella necesita dos cosas que no se pueden
 * equivocar: qué módulos están oscuros (y que preguntar fuera de la matriz dé `false`, no un
 * error) y dónde caen los patrones de alineación, porque esos se dibujan cuadrados.
 */

describe('los centros de los patrones de alineación (tabla E.1 de la norma)', () => {
  it.each([
    [1, []],
    [2, [6, 18]],
    [3, [6, 22]],
    [7, [6, 22, 38]],
    [14, [6, 26, 46, 66]],
    [21, [6, 28, 50, 72, 94]],
    [32, [6, 34, 60, 86, 112, 138]],
    [40, [6, 30, 58, 86, 114, 142, 170]],
  ])('la versión %i los pone en %j', (version, esperados) => {
    // Arrange · Act
    const posiciones = posicionesDeAlineacion(version);

    // Assert
    expect(posiciones).toEqual(esperados);
  });

  it('el último siempre cae a 7 módulos del borde', () => {
    // Arrange
    const versiones = Array.from({ length: VERSION_MAXIMA - 1 }, (_, i) => i + 2);

    // Act · Assert
    for (const version of versiones) {
      expect(posicionesDeAlineacion(version).at(-1)).toBe(tamanoDeVersion(version) - 7);
    }
  });

  it('una versión que no existe lanza RangeError en vez de inventar posiciones', () => {
    // Arrange · Act · Assert
    for (const version of [0, 41, -3, 2.5, Number.NaN]) {
      expect(() => posicionesDeAlineacion(version)).toThrow(RangeError);
    }
  });
});

describe('matrizDesdeFilas', () => {
  const filasDeVersion1 = (): boolean[][] =>
    Array.from({ length: 21 }, (_, y) => Array.from({ length: 21 }, (_, x) => x === y));

  it('saca la versión del tamaño cuando no se la dan', () => {
    // Arrange · Act
    const matriz = matrizDesdeFilas(filasDeVersion1());

    // Assert
    expect(matriz.version).toBe(1);
    expect(matriz.tamano).toBe(21);
  });

  it('pregunta por un módulo y contesta lo que hay', () => {
    // Arrange
    const matriz = matrizDesdeFilas(filasDeVersion1());

    // Act · Assert
    expect(matriz.modulo(5, 5)).toBe(true);
    expect(matriz.modulo(5, 6)).toBe(false);
  });

  it('fuera de la matriz siempre es falso, sin lanzar', () => {
    // Arrange
    const matriz = matrizDesdeFilas(filasDeVersion1());

    // Act · Assert
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [21, 0],
      [0, 21],
      [-5, -5],
      [99, 99],
      [1.5, 1],
    ] as const) {
      expect(matriz.modulo(x, y)).toBe(false);
    }
  });

  it('copia las filas: cambiarlas después no mueve el dibujo', () => {
    // Arrange
    const filas = filasDeVersion1();
    const matriz = matrizDesdeFilas(filas);

    // Act
    filas[3] = Array.from({ length: 21 }, () => false);

    // Assert
    expect(matriz.modulo(3, 3)).toBe(true);
  });

  it('rechaza una matriz que no es cuadrada', () => {
    // Arrange
    const filas = filasDeVersion1();
    filas[4] = [true];

    // Act · Assert
    expect(() => matrizDesdeFilas(filas)).toThrow(RangeError);
  });

  it('rechaza un tamaño que no es de ninguna versión', () => {
    // Arrange
    const filas = Array.from({ length: 22 }, () => Array.from({ length: 22 }, () => false));

    // Act · Assert
    expect(() => matrizDesdeFilas(filas)).toThrow(RangeError);
  });

  it('rechaza una versión que no corresponde al tamaño', () => {
    // Arrange · Act · Assert
    expect(() => matrizDesdeFilas(filasDeVersion1(), 2)).toThrow(/versión 2/);
  });
});

describe('la matriz sintética de las pruebas', () => {
  it('tiene la estructura de un QR: buscador, temporización y alineación', () => {
    // Arrange · Act
    const matriz = matrizSintetica(2);

    // Assert · buscador de la esquina superior izquierda: anillo oscuro, hueco claro, centro oscuro
    expect(matriz.modulo(0, 0)).toBe(true);
    expect(matriz.modulo(1, 1)).toBe(false);
    expect(matriz.modulo(3, 3)).toBe(true);
    // Assert · separador claro
    expect(matriz.modulo(7, 0)).toBe(false);
    // Assert · temporización: alterna desde el módulo 8
    expect(matriz.modulo(10, 6)).toBe(true);
    expect(matriz.modulo(11, 6)).toBe(false);
    // Assert · alineación de la versión 2 en (18, 18)
    expect(matriz.modulo(18, 18)).toBe(true);
    expect(matriz.modulo(17, 17)).toBe(false);
    expect(matriz.modulo(16, 16)).toBe(true);
  });

  it('es repetible: la misma semilla da la misma matriz', () => {
    // Arrange · Act
    const a = matrizSintetica(7, 42);
    const b = matrizSintetica(7, 42);

    // Assert
    const iguales = Array.from({ length: a.tamano }, (_, y) =>
      Array.from({ length: a.tamano }, (_, x) => a.modulo(x, y) === b.modulo(x, y)).every(Boolean),
    ).every(Boolean);
    expect(iguales).toBe(true);
  });
});
