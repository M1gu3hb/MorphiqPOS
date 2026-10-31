import { describe, expect, it } from 'vitest';

import { HOJA_CARTA, acomodarEnHojas, altoEnMm, pxDeMm, svgEnMm } from './medidas';

const CUADRADO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 41 41"><rect/></svg>';
const CON_MARCO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1280" viewBox="0 0 100 125"><rect width="100"/></svg>';

describe('las medidas para imprimir', () => {
  it('milímetros a píxeles a 300 ppp', () => {
    expect(pxDeMm(25.4)).toBe(300);
    expect(pxDeMm(60)).toBe(709);
    expect(pxDeMm(60, 150)).toBe(354);
  });

  it('el alto sale de la proporción del dibujo (el marco lo alarga)', () => {
    expect(altoEnMm(CUADRADO, 60)).toBe(60);
    expect(altoEnMm(CON_MARCO, 60)).toBe(75);
  });

  it('el SVG exportado mide en milímetros, sin tocar su dibujo', () => {
    const svg = svgEnMm(CON_MARCO, 60);
    expect(svg).toMatch(/^<svg [^>]*width="60mm" height="75mm"/);
    expect(svg).toContain('viewBox="0 0 100 125"');
    expect(svg).toContain('<rect width="100"/>');
  });

  it('acomoda las piezas en hojas, centradas, sin salirse de los márgenes', () => {
    const lugares = acomodarEnHojas(10, 60, 75);
    // Carta: 215.9 × 279.4 mm, márgenes de 10 mm y 6 mm entre piezas → 3 columnas × 3 filas.
    expect(lugares.filter((l) => l.hoja === 0)).toHaveLength(9);
    expect(lugares.filter((l) => l.hoja === 1)).toHaveLength(1);
    for (const { x, y } of lugares) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(x + 60).toBeLessThanOrEqual(HOJA_CARTA.ancho - 10 + 1e-9);
      expect(y + 75).toBeLessThanOrEqual(HOJA_CARTA.alto - 10 + 1e-9);
    }
    const fila = lugares.filter((l) => l.hoja === 0 && l.y === lugares[0]?.y).map((l) => l.x);
    const izquierda = fila[0] ?? 0;
    const derecha = HOJA_CARTA.ancho - ((fila.at(-1) ?? 0) + 60);
    expect(Math.abs(izquierda - derecha)).toBeLessThan(1e-9);
  });

  it('una pieza que no cabe en la hoja se dice, no se corta', () => {
    expect(() => acomodarEnHojas(1, 150, 270)).toThrow(/no cabe/);
  });
});
