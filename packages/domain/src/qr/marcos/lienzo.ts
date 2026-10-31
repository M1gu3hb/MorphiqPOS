/**
 * EL LIENZO DE UN MARCO: COLORES, TEXTOS Y LAS PIEZAS PARA DIBUJARLO.
 *
 * Cada diseño de marco dibuja en una cuadrícula de 100 unidades —el QR ocupa un cuadrado de
 * 100 × 100 en ella— y usa estas piezas: rectángulos, rutas, círculos, un teléfono, unos
 * corchetes de visor y texto. El lienzo ya trae los colores resueltos y los textos limpios, así
 * que un diseño no valida nada: sólo dibuja.
 */

import { exigirColor } from '../contraste.ts';
import { formatearNumero } from '../ruta.ts';
import { escaparXml, limpiarTexto } from '../xml.ts';
import { obtenerMarco, type IdMarco } from './catalogo.ts';

export type FuenteDeMarco = 'auto' | 'sans' | 'serif' | 'mono' | 'script';

export interface OpcionesDeMarco {
  readonly tipo: IdMarco;
  /** Color principal del marco. Por omisión `#123ca3`. */
  readonly color?: string;
  /** Segundo color del degradado del marco. Por omisión `#337cff`. */
  readonly colorAcento?: string;
  /** Color del texto sobre el marco. Por omisión blanco. */
  readonly colorTexto?: string;
  readonly texto?: string;
  readonly textoSecundario?: string;
  readonly textoPie?: string;
  readonly fuente?: FuenteDeMarco;
  /** Rellena el marco con un degradado de `color` a `colorAcento`. */
  readonly degradado?: boolean;
}

/** Lo máximo que se escribe en un texto del marco; lo demás se descarta. */
const LARGO_MAXIMO_DE_TEXTO = 140;
const TINTA_POR_OMISION = '#123ca3';
const ACENTO_POR_OMISION = '#337cff';
const CLARO_POR_OMISION = '#ffffff';
export const ID_DEL_RELLENO = 'frame-gradient';

const FUENTES: Readonly<Record<Exclude<FuenteDeMarco, 'auto'>, string>> = {
  sans: 'Arial, sans-serif',
  serif: 'Georgia, serif',
  mono: 'Courier New, monospace',
  script: 'cursive',
};

/** Los diseños con letra de sello usan cursiva si nadie pide otra. */
const MARCOS_MANUSCRITOS: readonly IdMarco[] = ['ribbon', 'wave-gradient'];

export interface Lienzo {
  readonly tinta: string;
  readonly acento: string;
  readonly fondo: string;
  /** Color del texto y de los trazos que van sobre la tinta. */
  readonly claro: string;
  /** `fill` de las formas del marco: la tinta, o el degradado si se pidió. */
  readonly relleno: string;
  readonly principal: string;
  readonly secundario: string;
  readonly pie: string;
  readonly rect: (
    x: number,
    y: number,
    ancho: number,
    alto: number,
    color: string,
    radio?: number,
    trazo?: string | null,
    grosor?: number,
  ) => string;
  readonly ruta: (d: string, color?: string, trazo?: string | null, grosor?: number) => string;
  readonly circulo: (
    cx: number,
    cy: number,
    r: number,
    color: string,
    trazo?: string | null,
    grosor?: number,
  ) => string;
  readonly texto: (
    valor: string,
    tx: number,
    ty: number,
    ancho: number,
    color?: string,
    tamano?: number,
    maxLineas?: number,
    rotacion?: number,
  ) => string;
  readonly telefono: (
    px: number,
    py: number,
    ancho: number,
    alto: number,
    color?: string,
    grosor?: number,
  ) => string;
  readonly corchetes: (x: number, y: number, ancho: number, alto: number, color?: string) => string;
}

function contorno(trazo: string | null, grosor: number, redondeado: boolean): string {
  if (trazo === null) return '';
  const extremos = redondeado ? ' stroke-linejoin="round" stroke-linecap="round"' : '';
  return ` stroke="${trazo}" stroke-width="${formatearNumero(grosor)}"${extremos}`;
}

function resolverFuente(opciones: OpcionesDeMarco): string {
  if (opciones.fuente !== undefined && opciones.fuente !== 'auto') return FUENTES[opciones.fuente];
  return MARCOS_MANUSCRITOS.includes(opciones.tipo) ? FUENTES.script : FUENTES.sans;
}

/** El lienzo de un marco: valida los colores, resuelve los textos y arma las piezas. */
export function crearLienzo(opciones: OpcionesDeMarco, fondo: string): Lienzo {
  const tinta = exigirColor(opciones.color ?? TINTA_POR_OMISION, 'El color del marco');
  const acento = exigirColor(opciones.colorAcento ?? ACENTO_POR_OMISION, 'El acento del marco');
  const claro = exigirColor(
    opciones.colorTexto ?? CLARO_POR_OMISION,
    'El color del texto del marco',
  );
  const relleno = opciones.degradado === true ? `url(#${ID_DEL_RELLENO})` : tinta;
  const ejemplo = obtenerMarco(opciones.tipo).ejemplo;
  const fuente = resolverFuente(opciones);

  const rect: Lienzo['rect'] = (x, y, ancho, alto, color, radio = 0, trazo = null, grosor = 1.5) =>
    `<rect x="${x}" y="${y}" width="${ancho}" height="${alto}" rx="${radio}" fill="${color}"${contorno(trazo, grosor, false)}/>`;
  const ruta: Lienzo['ruta'] = (d, color = relleno, trazo = null, grosor = 1.5) =>
    `<path d="${d}" fill="${color}"${contorno(trazo, grosor, true)}/>`;
  const circulo: Lienzo['circulo'] = (cx, cy, r, color, trazo = null, grosor = 1.5) =>
    `<circle cx="${formatearNumero(cx)}" cy="${formatearNumero(cy)}" r="${r}" fill="${color}"${contorno(trazo, grosor, false)}/>`;

  const texto: Lienzo['texto'] = (
    valor,
    tx,
    ty,
    ancho,
    color = claro,
    tamano = 7,
    maxLineas = 2,
    rotacion = 0,
  ) => {
    const lineas = limpiarTexto(valor, LARGO_MAXIMO_DE_TEXTO).split('\n').slice(0, maxLineas);
    if (!lineas.some((linea) => linea.trim() !== '')) return '';
    const mayor = Math.max(...lineas.map((linea) => Array.from(linea).length), 1);
    const letra = Math.max(2, Math.min(tamano, ancho / (mayor * 0.62)));
    const interlineado = letra * 1.15;
    const inicio = ty - ((lineas.length - 1) * interlineado) / 2;
    const giro = rotacion === 0 ? '' : ` transform="rotate(${rotacion} ${tx} ${ty})"`;
    const renglones = lineas
      .map(
        (linea, i) =>
          `<tspan x="${tx}" y="${formatearNumero(inicio + i * interlineado)}">${escaparXml(linea)}</tspan>`,
      )
      .join('');
    return `<text x="${tx}" y="${formatearNumero(inicio)}" text-anchor="middle" dominant-baseline="middle" font-family="${fuente}" font-weight="700" font-size="${formatearNumero(letra)}" fill="${color}"${giro}>${renglones}</text>`;
  };

  const telefono: Lienzo['telefono'] = (px, py, ancho, alto, color = claro, grosor = 1.5) =>
    rect(px, py, ancho, alto, 'none', 3, color, grosor) +
    ruta(
      `M${formatearNumero(px + ancho * 0.36)} ${py + 3}h${formatearNumero(ancho * 0.28)}M${formatearNumero(px + ancho * 0.44)} ${py + alto - 3}h${formatearNumero(ancho * 0.12)}`,
      'none',
      color,
      grosor * 0.7,
    );

  const corchetes: Lienzo['corchetes'] = (x, y, ancho, alto, color = tinta) =>
    ruta(
      `M${x} ${y + 13}V${y}h13M${x + ancho - 13} ${y}h13v13M${x} ${y + alto - 13}v13h13M${x + ancho - 13} ${y + alto}h13v-13`,
      'none',
      color,
      2,
    );

  return {
    tinta,
    acento,
    fondo,
    claro,
    relleno,
    principal: opciones.texto ?? ejemplo[0],
    secundario: opciones.textoSecundario ?? ejemplo[1],
    pie: opciones.textoPie ?? ejemplo[2],
    rect,
    ruta,
    circulo,
    texto,
    telefono,
    corchetes,
  };
}
