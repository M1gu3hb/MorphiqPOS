import { describe, expect, it } from 'vitest';

import {
  definicionDeLaTinta,
  hayDegradado,
  ID_DE_LA_TINTA,
  MODOS_DE_DEGRADADO,
  rellenoDeLaTinta,
  type Degradado,
} from './degradados.ts';
import { matrizSintetica } from './matriz-sintetica.ts';
import { renderizarQrSvg } from './renderizar.ts';
import { problemaDeXml } from './xml-de-prueba.ts';

/**
 * LA TINTA: LISA O CON DEGRADADO.
 *
 * El degradado pinta sólo los módulos de datos. Los ojos conservan su color liso: son lo que el
 * lector busca primero. Y como el degradado se escribe de una vez, no hay que buscar y
 * reemplazar nada en un SVG ya hecho.
 */

const NARANJA = '#c2410c';
const matriz = matrizSintetica(2);

function conDegradado(degradado: Degradado): string {
  return renderizarQrSvg(matriz, { primerPlano: '#08254c', ojos: '#000000', degradado });
}

/** Cuántas veces aparece `fragmento` en `texto`. */
const cuantas = (texto: string, fragmento: string): number => texto.split(fragmento).length - 1;

describe('el degradado de la tinta', () => {
  it('sin degradado, o en modo none, los módulos llevan el color liso y no hay defs', () => {
    // Arrange
    const sin = renderizarQrSvg(matriz, { primerPlano: '#08254c' });
    const apagado = conDegradado({ modo: 'none', color: NARANJA, angulo: 0 });

    // Act · Assert
    for (const svg of [sin, apagado]) {
      expect(svg).not.toContain('Gradient');
      expect(svg).not.toContain(`url(#${ID_DE_LA_TINTA})`);
      expect(svg).toContain('fill="#08254c"');
    }
  });

  it.each(['linear', 'radial', 'duo'] as const)(
    'el modo %s define el degradado y lo usa una sola vez',
    (modo) => {
      // Arrange · Act
      const svg = conDegradado({ modo, color: NARANJA, angulo: 30 });

      // Assert
      expect(cuantas(svg, `id="${ID_DE_LA_TINTA}"`)).toBe(1);
      expect(cuantas(svg, `fill="url(#${ID_DE_LA_TINTA})"`)).toBe(1);
      expect(svg).toContain(modo === 'radial' ? '<radialGradient' : '<linearGradient');
      expect(problemaDeXml(svg)).toBeNull();
    },
  );

  it('sólo los módulos de datos reciben el degradado: los ojos conservan su color liso', () => {
    // Arrange · Act
    const svg = conDegradado({ modo: 'linear', color: NARANJA, angulo: 0 });
    const caminos = svg.match(/<path [^>]*\/>/g) ?? [];
    const rellenos = caminos.map((camino) => /fill="([^"]+)"/.exec(camino)?.[1]);

    // Assert · 1 de datos + 3 ojos × (anillo, hueco, centro)
    expect(caminos).toHaveLength(10);
    expect(rellenos[0]).toBe(`url(#${ID_DE_LA_TINTA})`);
    expect(rellenos.slice(1).filter((relleno) => relleno === '#000000')).toHaveLength(6);
    expect(rellenos.slice(1).filter((relleno) => relleno === '#ffffff')).toHaveLength(3);
  });

  it('el modo duo parte la tinta en dos mitades con un corte seco en la mitad', () => {
    // Arrange · Act
    const defs = definicionDeLaTinta('#112233', { modo: 'duo', color: '#445566', angulo: 0 }, 27);

    // Assert
    expect(defs).toContain('<stop offset="0" stop-color="#112233"/>');
    expect(defs).toContain('<stop offset="0.4999" stop-color="#112233"/>');
    expect(defs).toContain('<stop offset="0.5" stop-color="#445566"/>');
    expect(defs).toContain('<stop offset="1" stop-color="#445566"/>');
  });

  it('el lineal va del primer color al segundo con dos paradas', () => {
    // Arrange · Act
    const defs = definicionDeLaTinta(
      '#112233',
      { modo: 'linear', color: '#445566', angulo: 0 },
      27,
    );

    // Assert
    expect(cuantas(defs, '<stop ')).toBe(2);
    expect(defs).toContain('stop-color="#112233"');
    expect(defs).toContain('stop-color="#445566"');
  });

  it('el ángulo gira la dirección sobre el lienzo entero (27 unidades, centro en 13.5)', () => {
    // Arrange
    const lineal = (angulo: number): string =>
      definicionDeLaTinta('#000000', { modo: 'linear', color: '#ffffff', angulo }, 27);

    // Act · Assert
    expect(lineal(0)).toContain('x1="0" y1="13.5" x2="27" y2="13.5"');
    expect(lineal(90)).toContain('x1="13.5" y1="0" x2="13.5" y2="27"');
    expect(lineal(180)).toContain('x1="27" y1="13.5" x2="0" y2="13.5"');
  });

  it('el radial se centra en el lienzo y llega más allá de las esquinas', () => {
    // Arrange · Act
    const defs = definicionDeLaTinta(
      '#000000',
      { modo: 'radial', color: '#ffffff', angulo: 0 },
      27,
    );

    // Assert
    expect(defs).toContain('cx="13.5" cy="13.5" r="18.9"');
    expect(defs).toContain('gradientUnits="userSpaceOnUse"');
  });

  it('no hay números con notación científica aunque el coseno de 90° no sea exactamente cero', () => {
    // Arrange · Act
    const defs = definicionDeLaTinta(
      '#000000',
      { modo: 'linear', color: '#ffffff', angulo: 90 },
      27,
    );

    // Assert
    expect(defs).not.toMatch(/\de-\d/);
  });

  it('hayDegradado y rellenoDeLaTinta dicen lo mismo', () => {
    // Arrange · Act · Assert
    expect(hayDegradado(undefined)).toBe(false);
    expect(hayDegradado({ modo: 'none', color: NARANJA, angulo: 0 })).toBe(false);
    for (const modo of MODOS_DE_DEGRADADO.filter((m) => m !== 'none')) {
      const degradado = { modo, color: NARANJA, angulo: 0 };
      expect(hayDegradado(degradado)).toBe(true);
      expect(rellenoDeLaTinta('#000000', degradado)).toBe(`url(#${ID_DE_LA_TINTA})`);
    }
    expect(rellenoDeLaTinta('#123456', undefined)).toBe('#123456');
  });
});
