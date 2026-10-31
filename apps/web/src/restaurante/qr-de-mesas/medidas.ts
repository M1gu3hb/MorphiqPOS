/**
 * LAS MEDIDAS PARA IMPRIMIR (DP-9.8): milímetros, puntos por pulgada y el acomodo de las piezas en
 * hojas. Puro: ni canvas ni PDF aquí, sólo números.
 */

const MM_POR_PULGADA = 25.4;
export const PPP_DE_IMPRESION = 300;

/** Carta, la hoja de las papelerías de México. */
export const HOJA_CARTA = { ancho: 215.9, alto: 279.4 } as const;
export const MARGEN_DE_HOJA_MM = 10;
export const SEPARACION_MM = 6;

export function pxDeMm(mm: number, ppp = PPP_DE_IMPRESION): number {
  return Math.round((mm / MM_POR_PULGADA) * ppp);
}

function proporcion(svg: string): number {
  const caja = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const ancho = Number(caja?.[1]);
  const alto = Number(caja?.[2]);
  return ancho > 0 && alto > 0 ? alto / ancho : 1;
}

/** El alto impreso de una pieza de `anchoMm`, según la proporción de su dibujo. */
export function altoEnMm(svg: string, anchoMm: number): number {
  return Math.round(anchoMm * proporcion(svg) * 100) / 100;
}

/** El mismo SVG, medido en milímetros: así lo imprime cualquier programa a su tamaño real. */
export function svgEnMm(svg: string, anchoMm: number): string {
  const alto = altoEnMm(svg, anchoMm);
  return svg.replace(
    /^<svg ([^>]*?)width="[^"]*" height="[^"]*"/,
    `<svg $1width="${String(anchoMm)}mm" height="${String(alto)}mm"`,
  );
}

export interface Lugar {
  readonly hoja: number;
  readonly x: number;
  readonly y: number;
}

/** Dónde va cada pieza: tantas por hoja como quepan, la cuadrícula centrada en la hoja. */
export function acomodarEnHojas(
  cantidad: number,
  anchoMm: number,
  altoMm: number,
  hoja: { readonly ancho: number; readonly alto: number } = HOJA_CARTA,
): Lugar[] {
  const util = (lado: number) => lado - 2 * MARGEN_DE_HOJA_MM + SEPARACION_MM;
  const columnas = Math.floor(util(hoja.ancho) / (anchoMm + SEPARACION_MM));
  const filas = Math.floor(util(hoja.alto) / (altoMm + SEPARACION_MM));
  if (columnas < 1 || filas < 1) {
    throw new RangeError(
      `Una pieza de ${String(anchoMm)} × ${String(altoMm)} mm no cabe en la hoja: hazla más chica.`,
    );
  }
  const anchoDeLaCuadricula = columnas * anchoMm + (columnas - 1) * SEPARACION_MM;
  const x0 = (hoja.ancho - anchoDeLaCuadricula) / 2;
  const porHoja = columnas * filas;
  return Array.from({ length: cantidad }, (_, i) => {
    const enLaHoja = i % porHoja;
    return {
      hoja: Math.floor(i / porHoja),
      x: x0 + (enLaHoja % columnas) * (anchoMm + SEPARACION_MM),
      y: MARGEN_DE_HOJA_MM + Math.floor(enLaHoja / columnas) * (altoMm + SEPARACION_MM),
    };
  });
}
