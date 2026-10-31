/**
 * LA TINTA DE LOS MÓDULOS: LISA O CON DEGRADADO.
 *
 * El degradado pinta SÓLO los módulos de datos. Los ojos conservan su color liso: son lo que el
 * lector busca primero y un degradado que los aclare puede hacerlos invisibles. Por eso el
 * constructor del SVG pinta los datos con `fill="url(#qr-ink)"` y los ojos con su color —no hay
 * que buscar y reemplazar nada en el texto ya hecho—.
 */

import { tieneColoresLegibles } from './contraste.ts';
import { formatearNumero } from './ruta.ts';

/**
 * - `none`: color liso.
 * - `linear`: de la tinta al color del degradado, a lo largo de `angulo`.
 * - `radial`: del centro hacia afuera.
 * - `duo`: dos mitades de color liso, sin transición.
 */
export const MODOS_DE_DEGRADADO = ['none', 'linear', 'radial', 'duo'] as const;
export type ModoDeDegradado = (typeof MODOS_DE_DEGRADADO)[number];

export interface Degradado {
  readonly modo: ModoDeDegradado;
  /** El segundo color (`#rgb` o `#rrggbb`); el primero es el `primerPlano` del QR. */
  readonly color: string;
  /** Dirección en grados; 0 es de izquierda a derecha. Los modos `radial` y `none` lo ignoran. */
  readonly angulo: number;
}

/** El id con el que el SVG nombra su degradado. `prefijarIds` lo vuelve único por página. */
export const ID_DE_LA_TINTA = 'qr-ink';

/** ¿Hay algo que dibujar? `none` y la ausencia de degradado son lo mismo. */
export function hayDegradado(degradado: Degradado | undefined): degradado is Degradado {
  return degradado !== undefined && degradado.modo !== 'none';
}

/** El `fill` de los módulos de datos. */
export function rellenoDeLaTinta(primerPlano: string, degradado: Degradado | undefined): string {
  return hayDegradado(degradado) ? `url(#${ID_DE_LA_TINTA})` : primerPlano;
}

function paradas(primerPlano: string, degradado: Degradado): string {
  const inicio = `<stop offset="0" stop-color="${primerPlano}"/>`;
  const fin = `<stop offset="1" stop-color="${degradado.color}"/>`;
  if (degradado.modo !== 'duo') return inicio + fin;
  return (
    inicio +
    `<stop offset="0.4999" stop-color="${primerPlano}"/>` +
    `<stop offset="0.5" stop-color="${degradado.color}"/>` +
    fin
  );
}

/**
 * El `<defs>` con el degradado, o cadena vacía si no hay. Las coordenadas son del espacio del
 * usuario (los módulos), de modo que el degradado cubre todo el código y no cada módulo.
 *
 * @param lado el lado del lienzo en módulos: tamaño de la matriz más los dos márgenes.
 */
export function definicionDeLaTinta(
  primerPlano: string,
  degradado: Degradado | undefined,
  lado: number,
): string {
  if (!hayDegradado(degradado)) return '';
  const centro = lado / 2;
  const radianes = (degradado.angulo * Math.PI) / 180;
  const dx = (Math.cos(radianes) * lado) / 2;
  const dy = (Math.sin(radianes) * lado) / 2;
  const cuerpo = paradas(primerPlano, degradado);
  const definicion =
    degradado.modo === 'radial'
      ? `<radialGradient id="${ID_DE_LA_TINTA}" gradientUnits="userSpaceOnUse" cx="${formatearNumero(centro)}" cy="${formatearNumero(centro)}" r="${formatearNumero(lado * 0.7)}">${cuerpo}</radialGradient>`
      : `<linearGradient id="${ID_DE_LA_TINTA}" gradientUnits="userSpaceOnUse" x1="${formatearNumero(centro - dx)}" y1="${formatearNumero(centro - dy)}" x2="${formatearNumero(centro + dx)}" y2="${formatearNumero(centro + dy)}">${cuerpo}</linearGradient>`;
  return `<defs>${definicion}</defs>`;
}

export interface ColoresDelDiseno {
  readonly primerPlano: string;
  readonly ojos: string;
  readonly fondo: string;
  readonly degradado?: Degradado | undefined;
}

/**
 * ¿Se leerá el diseño? Los módulos, los ojos y —si hay degradado— el segundo color del
 * degradado tienen que contrastar con el fondo (ver `tieneColoresLegibles`).
 */
export function disenoLegible({ primerPlano, ojos, fondo, degradado }: ColoresDelDiseno): boolean {
  return (
    tieneColoresLegibles(primerPlano, ojos, fondo) &&
    (!hayDegradado(degradado) || tieneColoresLegibles(degradado.color, ojos, fondo))
  );
}
