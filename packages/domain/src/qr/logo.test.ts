import { describe, expect, it } from 'vitest';

import { geometriaDeLogo, type OpcionesDeLogo } from './logo.ts';
import { MAPA_DE_BITS } from './logo-de-prueba.ts';
import { matrizSintetica } from './matriz-sintetica.ts';
import { VERSION_MAXIMA } from './matriz.ts';
import { estaEnBuscador } from './protegidos.ts';

/**
 * LA VENTANA DEL LOGO.
 *
 * Un cuadrado centrado de a lo más el 30 % del lado del código, con la imagen recortada dentro.
 * Lo que importa: que la ventana no se mueva cuando se mueve la imagen y que NUNCA llegue a un
 * buscador. (El SVG que se escribe con ella está en `logo-fragmento.test.ts`.)
 */

const MARGEN = 1;

/** Las opciones más agresivas posibles: ventana máxima, zoom máximo, imagen lanzada al extremo. */
const EXTREMAS: readonly OpcionesDeLogo[] = [
  { tamano: 30 },
  { tamano: 1000, zoom: 400, x: 1e6, y: -1e6 },
  { modulosDeLado: 99, forma: 'circle' },
  { tamano: 30, zoom: 50, x: -100, y: 100, ajuste: 'cover', forma: 'rounded' },
  { modulosDeLado: 50, anclarADesplazamiento: true, x: 500, y: 500 },
  { tamano: 0, modulosDeLado: 0, zoom: 0 },
];

describe('la geometría de la ventana del logo', () => {
  const matriz = matrizSintetica(5);

  it('zoom y desplazamiento mueven la imagen pero no la ventana', () => {
    // Arrange
    const inicial = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS);

    // Act
    const movida = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { zoom: 200, x: 30, y: -30 });

    // Assert
    expect(movida.lado).toBe(inicial.lado);
    expect(movida.inicio).toBe(inicial.inicio);
    expect(movida.ancho).toBeCloseTo(inicial.ancho * 2, 10);
    expect(movida.x).not.toBe(inicial.x);
  });

  it('en auto, una imagen transparente o de logotipo se ajusta entera y una foto llena la ventana', () => {
    // Arrange
    const foto = { ...MAPA_DE_BITS, transparente: false };

    // Act · Assert
    expect(geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS).ajuste).toBe('contain');
    expect(geometriaDeLogo(matriz, MARGEN, { ...foto, esLogotipo: true }).ajuste).toBe('contain');
    expect(geometriaDeLogo(matriz, MARGEN, foto).ajuste).toBe('cover');
    expect(geometriaDeLogo(matriz, MARGEN, foto, { ajuste: 'contain' }).ajuste).toBe('contain');
  });

  it('cover llena la ventana y contain deja entera la imagen', () => {
    // Arrange · Act
    const cover = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { ajuste: 'cover' });
    const contain = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { ajuste: 'contain' });

    // Assert
    expect(cover.alto).toBeCloseTo(cover.lado, 10);
    expect(cover.ancho).toBeGreaterThan(cover.lado);
    expect(contain.ancho).toBeCloseTo(contain.lado, 10);
    expect(contain.alto).toBeLessThan(contain.lado);
  });

  it('el lado nunca pasa del 30 % del código, por grande que se pida', () => {
    // Arrange · Act
    const grande = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { tamano: 90 });
    const enModulos = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { modulosDeLado: 40 });

    // Assert
    expect(grande.lado).toBe(Math.floor(matriz.tamano * 0.3));
    expect(enModulos.lado).toBe(Math.floor(matriz.tamano * 0.3));
  });

  it('el lado mínimo son 2 módulos', () => {
    // Arrange · Act · Assert
    expect(geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { modulosDeLado: 0 }).lado).toBe(2);
  });

  it('la forma decide el radio de las esquinas de la ventana', () => {
    // Arrange
    const radio = (forma: 'square' | 'rounded' | 'circle'): number =>
      geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { forma }).radio;
    const lado = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS).lado;

    // Act · Assert
    expect(radio('square')).toBe(0);
    expect(radio('rounded')).toBeCloseTo(lado * 0.16, 10);
    expect(radio('circle')).toBe(lado / 2);
  });

  it('al desplazar al extremo, al menos un cuarto de la imagen queda dentro de la ventana', () => {
    // Arrange · Act
    const g = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, { x: 100, y: 100, zoom: 100 });

    // Assert · solape horizontal entre la imagen y la ventana
    const solape = Math.min(g.x + g.ancho, g.inicio + g.lado) - Math.max(g.x, g.inicio);
    expect(solape).toBeGreaterThanOrEqual(Math.min(g.ancho, g.lado) * 0.25 - 1e-9);
  });

  it('el desplazamiento en módulos se limita al recorrido posible', () => {
    // Arrange · Act
    const lejos = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, {
      x: 9999,
      modoDeDesplazamiento: 'modules',
    });
    const alTope = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, {
      x: lejos.recorridoX,
      modoDeDesplazamiento: 'modules',
    });

    // Assert
    expect(lejos.x).toBeCloseTo(alTope.x, 10);
  });

  it('una imagen sin dimensiones no se puede acomodar', () => {
    // Arrange · Act · Assert
    for (const ancho of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => geometriaDeLogo(matriz, MARGEN, { ...MAPA_DE_BITS, ancho })).toThrow(RangeError);
    }
  });
});

describe('la ventana del logo nunca cubre un buscador', () => {
  const versiones = [1, 2, 3, 7, 10, 20, 32, VERSION_MAXIMA];

  it.each(versiones)('en la versión %i, con cualquier combinación de opciones', (version) => {
    // Arrange
    const matriz = matrizSintetica(version);

    for (const opciones of [{}, ...EXTREMAS]) {
      // Act
      const g = geometriaDeLogo(matriz, MARGEN, MAPA_DE_BITS, opciones);
      const desde = g.inicio - MARGEN;
      const hasta = desde + g.lado;

      // Assert · la ventana cabe en la matriz, está centrada y ningún módulo suyo es de un buscador
      expect(desde).toBeGreaterThanOrEqual(0);
      expect(hasta).toBeLessThanOrEqual(matriz.tamano);
      expect(Math.abs(desde - (matriz.tamano - hasta))).toBeLessThanOrEqual(1);
      for (let y = desde; y < hasta; y++) {
        for (let x = desde; x < hasta; x++) {
          expect(
            estaEnBuscador(matriz, x, y),
            `v${version} (${x}, ${y}) ${JSON.stringify(opciones)}`,
          ).toBe(false);
        }
      }
    }
  });
});
