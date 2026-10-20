import { describe, expect, it } from 'vitest';

import { MESA_STATUS_CONFIG, insigniaDeEstadoDeMesa } from '../../heredado/lib/constants.js';
import { MESA_STATUS_DARK } from '../../heredado/lib/darkPalettes.js';

/**
 * LOS ESTADOS DE MESA SE LEEN (cierre del 21-10).
 *
 * El mapa del mesero pinta cada mesa con el color de su estado y escribe el estado con letra de
 * 8-9 px. En modo claro, 6 de 10 etiquetas bajaban de 4.5:1 —«En preparación», blanco sobre
 * naranja, 2.36:1, y ni el número de la mesa se leía— y el chip del teléfono ponía blanco sobre
 * blanco. Las mesas se pintan con un DEGRADADO, que la puerta de contraste del rastreo no mide,
 * así que se mide aquí, contra los dos extremos del degradado, con la fórmula de WCAG 2.
 */

interface Estado {
  readonly label: string;
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

const CLARO = MESA_STATUS_CONFIG as unknown as Readonly<Record<string, Estado>>;
const OSCURO = MESA_STATUS_DARK as unknown as Readonly<Record<string, Partial<Estado>>>;

type Rgb = readonly [number, number, number];

function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminancia([r, g, b]: Rgb): number {
  const canal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: Rgb, b: Rgb): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((oscuro ?? 0) + 0.05);
}

/** `shade()` de `MesaShape.jsx`: suma un porcentaje de 255 a cada canal. */
function sombra([r, g, b]: Rgb, porcentaje: number): Rgb {
  const d = Math.round(255 * (porcentaje / 100));
  const fijo = (c: number) => Math.max(0, Math.min(255, c + d));
  return [fijo(r), fijo(g), fijo(b)];
}

/** Una capa negra con opacidad `a` sobre el fondo: la pastilla de la etiqueta. */
function bajoPastilla([r, g, b]: Rgb, a: number): Rgb {
  return [Math.round(r * (1 - a)), Math.round(g * (1 - a)), Math.round(b * (1 - a))];
}

const esBlanco = (color: string) => color.toLowerCase() === '#ffffff';

/** Los dos extremos del degradado de una mesa en claro (`MesaShape` −8, la rejilla −10). */
const extremosEnClaro = (fill: string): readonly Rgb[] => [
  rgb(fill),
  sombra(rgb(fill), -8),
  sombra(rgb(fill), -10),
];

describe('los estados de mesa se leen', () => {
  it('en claro, la etiqueta de cada estado pasa 4.5:1 (con pastilla si el texto es blanco)', () => {
    const fallas: string[] = [];
    for (const [estado, cfg] of Object.entries(CLARO)) {
      for (const fondo of extremosEnClaro(cfg.fill)) {
        const detras = esBlanco(cfg.text) ? bajoPastilla(fondo, 0.35) : fondo;
        const razon = contraste(rgb(cfg.text), detras);
        if (razon < 4.5) fallas.push(`${estado}: ${razon.toFixed(2)}:1`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('en claro, el número de la mesa (texto grande) pasa 3:1 sobre el relleno', () => {
    const fallas = Object.entries(CLARO)
      .map(([estado, cfg]) => [estado, contraste(rgb(cfg.text), rgb(cfg.fill))] as const)
      .filter(([, razon]) => razon < 3)
      .map(([estado, razon]) => `${estado}: ${razon.toFixed(2)}:1`);
    expect(fallas).toEqual([]);
  });

  it('cada insignia de estado (texto chico sobre su color) pasa 4.5:1', () => {
    const fallas: string[] = [];
    for (const [estado, cfg] of Object.entries(CLARO)) {
      const { background, color } = insigniaDeEstadoDeMesa(cfg) as {
        background: string;
        color: string;
      };
      const razon = contraste(rgb(color), rgb(background));
      if (razon < 4.5) fallas.push(`${estado}: ${razon.toFixed(2)}:1`);
    }
    expect(fallas).toEqual([]);
  });

  it('en oscuro, cada etiqueta pasa 4.5:1 sobre su relleno', () => {
    const fallas: string[] = [];
    for (const [estado, cfg] of Object.entries(OSCURO)) {
      if (cfg.fill === undefined || cfg.text === undefined) continue;
      for (const fondo of [rgb(cfg.fill), sombra(rgb(cfg.fill), 6)]) {
        const razon = contraste(rgb(cfg.text), fondo);
        if (razon < 4.5) fallas.push(`${estado}: ${razon.toFixed(2)}:1`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('la medida ve lo ilegible: blanco sobre el naranja de antes no pasa', () => {
    expect(contraste(rgb('#ffffff'), rgb('#FB8C2A'))).toBeLessThan(3);
  });
});
