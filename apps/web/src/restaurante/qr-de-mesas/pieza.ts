import {
  prefijarIds,
  renderizarQrSvg,
  type ImagenLogo,
  type OpcionesQr,
} from '@morphiqpos/domain/qr';

import { matrizDelContenido } from './codificar';
import type { DisenoDeQr } from './diseno';

/**
 * LA PIEZA DE UNA MESA (DP-9.8): su QR —con el CONTENIDO de siempre, la dirección con su token—
 * dibujado con su diseño, y su marco con el número de la mesa.
 */

/** La zona en blanco alrededor del código, en módulos: la que pide la norma. */
export const MARGEN_EN_MODULOS = 4;
/** El lado con el que se dibuja para revisar y exportar; la vista previa lo escala. */
export const LADO_DE_TRABAJO_PX = 1024;

export interface PiezaDeMesa {
  readonly contenido: string;
  readonly numero: number;
  readonly diseno: DisenoDeQr;
  /** El logo del negocio, ya cargado; `null` si el negocio no tiene. */
  readonly logo: ImagenLogo | null;
}

export function conNumeroDeMesa(texto: string, numero: number): string {
  return texto.replaceAll('{mesa}', String(numero));
}

export function opcionesDeLaPieza(
  { numero, diseno, logo }: PiezaDeMesa,
  ladoPx: number,
): OpcionesQr {
  const { modulo, ojo, centro, primerPlano, ojos, fondo, degradado, marco } = diseno;
  return {
    margen: MARGEN_EN_MODULOS,
    tamano: ladoPx,
    modulo,
    ojo,
    centro,
    primerPlano,
    ojos,
    fondo,
    ...(degradado === null ? {} : { degradado }),
    ...(diseno.conLogo && logo !== null ? { logo: { imagen: logo } } : {}),
    ...(marco === null
      ? {}
      : {
          marco: {
            tipo: marco.tipo,
            texto: conNumeroDeMesa(marco.texto, numero),
            textoSecundario: conNumeroDeMesa(marco.textoSecundario, numero),
            color: marco.color,
            colorTexto: marco.colorTexto,
          },
        }),
  };
}

/** El SVG de la pieza, con ids propios de la mesa (varias conviven en una página o un PDF). */
export function svgDeLaPieza(pieza: PiezaDeMesa, ladoPx = LADO_DE_TRABAJO_PX): string {
  const conLogo = pieza.diseno.conLogo && pieza.logo !== null;
  const matriz = matrizDelContenido(pieza.contenido, conLogo);
  return prefijarIds(
    renderizarQrSvg(matriz, opcionesDeLaPieza(pieza, ladoPx)),
    `mesa${String(pieza.numero)}-`,
  );
}
