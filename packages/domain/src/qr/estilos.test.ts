import { describe, expect, it } from 'vitest';

import {
  centrosCompatibles,
  ESTILOS_DE_CENTRO,
  ESTILOS_DE_MODULO,
  ESTILOS_DE_OJO,
} from './catalogo.ts';
import { rutaDeDatos, rutaDeModulo } from './estilos-de-modulos.ts';
import { matrizConModulos, matrizSintetica } from './matriz-sintetica.ts';
import { rutasDeOjo } from './ojos.ts';
import { esModuloProtegido, estaEnBuscador } from './protegidos.ts';
import { posicionesDeAlineacion } from './matriz.ts';
import { rutaSvg, type Ruta } from './ruta.ts';

/**
 * LAS FORMAS: MÓDULOS, OJOS Y CENTROS.
 *
 * Cada estilo se dibuja con una versión 2 (un patrón de alineación) y una 7 (tres, y la franja de
 * versión). Lo que importa: que ninguno lance ni produzca números rotos, que los módulos
 * protegidos salgan cuadrados pase lo que pase y que cada forma quepa en su casilla.
 */

const VERSIONES = [2, 7] as const;
const MARGEN = 1;

/** Los puntos (x, y) de una ruta, curvas incluidas. */
function puntosDe(ruta: Ruta): readonly (readonly [number, number])[] {
  return ruta.flatMap((comando) => {
    switch (comando[0]) {
      case 'M':
      case 'L':
        return [[comando[1], comando[2]] as const];
      case 'C':
        return [
          [comando[1], comando[2]] as const,
          [comando[3], comando[4]] as const,
          [comando[5], comando[6]] as const,
        ];
      case 'Z':
        return [];
    }
  });
}

function cabeEn(ruta: Ruta, minimo: number, maximo: number, holgura = 1e-9): boolean {
  return puntosDe(ruta).every(([x, y]) =>
    [x, y].every((valor) => valor >= minimo - holgura && valor <= maximo + holgura),
  );
}

describe('los módulos de datos', () => {
  describe.each(VERSIONES)('en una matriz de la versión %i', (version) => {
    const matriz = matrizSintetica(version);

    it.each(ESTILOS_DE_MODULO.map((estilo) => estilo.id))(
      '«%s» se dibuja sin lanzar y sin números rotos',
      (estilo) => {
        // Arrange · Act
        const d = rutaSvg(rutaDeDatos(matriz, estilo, MARGEN));

        // Assert
        expect(d.startsWith('M')).toBe(true);
        expect(d).not.toMatch(/NaN|Infinity|undefined/);
      },
    );
  });

  it('un módulo aislado cabe en su casilla (con lo que sobresalen las curvas del corazón)', () => {
    // Arrange
    const matriz = matrizConModulos(2, [[12, 12]]);

    // Act · Assert
    for (const estilo of ESTILOS_DE_MODULO) {
      expect(cabeEn(rutaDeModulo(matriz, 12, 12, estilo.id), 11.9, 13.1), estilo.id).toBe(true);
    }
  });

  it('un módulo aislado no sale cuadrado en ningún estilo salvo el cuadrado', () => {
    // Arrange
    const matriz = matrizConModulos(2, [[12, 12]]);
    const cuadrado = rutaSvg(rutaDeModulo(matriz, 12, 12, 'square'));

    // Act · Assert
    for (const estilo of ESTILOS_DE_MODULO) {
      if (estilo.id === 'square') continue;
      expect(rutaSvg(rutaDeModulo(matriz, 12, 12, estilo.id)), estilo.id).not.toBe(cuadrado);
    }
  });

  it('un módulo rodeado de vecinos oscuros se funde: los estilos continuos lo dejan cuadrado', () => {
    // Arrange
    const vecinos = [
      [12, 12],
      [12, 11],
      [12, 13],
      [11, 12],
      [13, 12],
    ] as const;
    const matriz = matrizConModulos(2, vecinos);
    const cuadrado = rutaSvg(rutaDeModulo(matriz, 12, 12, 'square'));
    const continuos = [
      'joined',
      'liquid',
      'organic',
      'bevel',
      'squircle',
      'extra-rounded',
      'classy',
    ] as const;

    // Act · Assert
    for (const estilo of continuos) {
      expect(rutaSvg(rutaDeModulo(matriz, 12, 12, estilo)), estilo).toBe(cuadrado);
    }
  });

  it('las redes tienden un puente hacia cada vecino oscuro', () => {
    // Arrange
    const aislado = matrizConModulos(2, [[12, 12]]);
    const conVecino = matrizConModulos(2, [
      [12, 12],
      [13, 12],
    ]);

    // Act · Assert
    for (const estilo of ['pipe', 'round-bridge', 'maze', 'stitch', 'soft-cross'] as const) {
      const sola = rutaDeModulo(aislado, 12, 12, estilo);
      const unida = rutaDeModulo(conVecino, 12, 12, estilo);
      expect(unida.length, estilo).toBeGreaterThan(sola.length);
    }
  });

  it('las cintas redondean sólo los extremos sin vecino', () => {
    // Arrange
    const suelta = matrizConModulos(2, [[12, 12]]);
    const enMedio = matrizConModulos(2, [
      [11, 12],
      [12, 12],
      [13, 12],
    ]);

    // Act · Assert
    expect(rutaSvg(rutaDeModulo(enMedio, 12, 12, 'ribbon-h'))).not.toBe(
      rutaSvg(rutaDeModulo(suelta, 12, 12, 'ribbon-h')),
    );
    expect(rutaSvg(rutaDeModulo(enMedio, 12, 12, 'ribbon-v'))).toBe(
      rutaSvg(rutaDeModulo(suelta, 12, 12, 'ribbon-v')),
    );
  });
});

describe('los módulos protegidos salen cuadrados sea cual sea el estilo', () => {
  // Un módulo suelto de cada clase de protegido de una versión 2, y uno que no lo es.
  const protegidos = [
    { nombre: 'temporización horizontal', x: 10, y: 6 },
    { nombre: 'temporización vertical', x: 6, y: 12 },
    { nombre: 'franja de formato', x: 8, y: 12 },
    { nombre: 'patrón de alineación', x: 18, y: 18 },
    { nombre: 'borde del patrón de alineación', x: 20, y: 16 },
  ] as const;

  it.each(protegidos)('$nombre en ($x, $y)', ({ x, y }) => {
    // Arrange
    const matriz = matrizConModulos(2, [[x, y]]);
    const cuadrado = rutaSvg(rutaDeDatos(matriz, 'square', MARGEN));

    // Act · Assert
    expect(esModuloProtegido(matriz, x, y, posicionesDeAlineacion(2))).toBe(true);
    for (const estilo of ESTILOS_DE_MODULO) {
      expect(rutaSvg(rutaDeDatos(matriz, estilo.id, MARGEN)), estilo.id).toBe(cuadrado);
    }
  });

  it('el patrón de alineación de una versión 7 también, en sus tres lugares', () => {
    // Arrange
    const posiciones = posicionesDeAlineacion(7);
    const centros = [
      [22, 22],
      [6, 22],
      [22, 6],
      [38, 22],
      [22, 38],
      [38, 38],
    ] as const;

    // Act · Assert
    for (const [x, y] of centros) {
      const matriz = matrizConModulos(7, [[x, y]]);
      expect(esModuloProtegido(matriz, x, y, posiciones), `(${x}, ${y})`).toBe(true);
    }
  });

  it('un módulo de datos de verdad no está protegido y sí toma la forma del estilo', () => {
    // Arrange
    const matriz = matrizConModulos(2, [[12, 12]]);

    // Act
    const protegido = esModuloProtegido(matriz, 12, 12, posicionesDeAlineacion(2));

    // Assert
    expect(protegido).toBe(false);
    expect(rutaSvg(rutaDeDatos(matriz, 'dots', MARGEN))).not.toBe(
      rutaSvg(rutaDeDatos(matriz, 'square', MARGEN)),
    );
  });

  it('los módulos de los buscadores no entran a la ruta de datos: los dibujan los ojos', () => {
    // Arrange
    const matriz = matrizConModulos(2, [
      [0, 0],
      [3, 3],
      [24, 0],
      [0, 24],
    ]);

    // Act
    const d = rutaSvg(rutaDeDatos(matriz, 'square', MARGEN));

    // Assert
    expect(d).toBe('');
    expect(estaEnBuscador(matriz, 3, 3)).toBe(true);
    expect(estaEnBuscador(matriz, 24, 24)).toBe(false);
  });

  it('el desplazamiento por el margen mueve los módulos y deja intacta la ruta original', () => {
    // Arrange
    const matriz = matrizConModulos(2, [[12, 12]]);

    // Act
    const sinMargen = rutaSvg(rutaDeDatos(matriz, 'square', 0));
    const conMargen = rutaSvg(rutaDeDatos(matriz, 'square', 4));

    // Assert
    expect(sinMargen).toBe('M12 12L13 12L13 13L12 13Z');
    expect(conMargen).toBe('M16 16L17 16L17 17L16 17Z');
  });
});

describe('los ojos y sus centros', () => {
  const combinaciones = ESTILOS_DE_OJO.flatMap((ojo) =>
    ESTILOS_DE_CENTRO.map((centro) => [ojo.id, centro.id] as const),
  );

  it.each(combinaciones)(
    'ojo «%s» con centro «%s»: tres capas, bien proporcionadas',
    (ojo, centro) => {
      // Arrange · Act
      const [anillo, hueco, nucleo] = rutasDeOjo(1, 1, ojo, centro);

      // Assert · el anillo cabe en 7 × 7, el hueco en 5 × 5 y el centro en 3 × 3
      expect(cabeEn(anillo, 1, 8)).toBe(true);
      expect(cabeEn(hueco, 2, 7)).toBe(true);
      expect(cabeEn(nucleo, 3, 6)).toBe(true);
      for (const capa of [anillo, hueco, nucleo]) {
        expect(rutaSvg(capa)).not.toMatch(/NaN|Infinity|undefined/);
      }
    },
  );

  it('el anillo cuadrado y su centro cuadrado ocupan exactamente 7 × 7, 5 × 5 y 3 × 3', () => {
    // Arrange · Act
    const [anillo, hueco, nucleo] = rutasDeOjo(0, 0, 'square', 'square');

    // Assert
    expect(rutaSvg(anillo)).toBe('M0 0L7 0L7 7L0 7Z');
    expect(rutaSvg(hueco)).toBe('M1 1L6 1L6 6L1 6Z');
    expect(rutaSvg(nucleo)).toBe('M2 2L5 2L5 5L2 5Z');
  });

  it('cada ojo tiene al menos un centro compatible que se dibuja sin problema', () => {
    // Arrange · Act · Assert
    for (const ojo of ESTILOS_DE_OJO) {
      for (const centro of centrosCompatibles(ojo.id)) {
        expect(rutasDeOjo(0, 0, ojo.id, centro)).toHaveLength(3);
      }
    }
  });
});
