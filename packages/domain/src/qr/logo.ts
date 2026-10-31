/**
 * EL LOGO EN EL CENTRO DEL CÓDIGO.
 *
 * Un QR con nivel de corrección alto aguanta que se le tape el centro, pero no cualquier parte:
 * la ventana del logo es un cuadrado centrado de a lo más el 30 % del lado (9 % del área), y
 * dentro de ella los módulos protegidos —temporización, alineación, formato— se quedan visibles
 * encima de la imagen con una máscara. Los buscadores quedan fuera por construcción: la ventana
 * nunca llega a las esquinas.
 *
 * Este módulo sólo calcula y escribe el SVG. Cargar la imagen, medirla y limpiarla (quitarle
 * márgenes vacíos, sanear un SVG) pasa antes, en la app, y llega aquí ya hecho como `ImagenLogo`.
 */

import { exigirColor } from './contraste.ts';
import type { MatrizQr } from './matriz.ts';
import { posicionesDeAlineacion } from './matriz.ts';
import { esModuloProtegido } from './protegidos.ts';
import { formatearNumero } from './ruta.ts';
import { escaparXml } from './xml.ts';

export type AjusteDeLogo = 'auto' | 'cover' | 'contain';
export type FormaDeVentana = 'square' | 'rounded' | 'circle';
export type FusionDeLogo = 'integrated' | 'weave';
export type ModoDeDesplazamiento = 'percent' | 'modules';

export interface ImagenLogo {
  /** Dimensiones de la imagen ya recortada, en cualquier unidad: sólo importa la proporción. */
  readonly ancho: number;
  readonly alto: number;
  /** ¿Tiene transparencia? Una imagen transparente se ajusta entera (`contain`) en `auto`. */
  readonly transparente?: boolean;
  /** ¿Parece un logotipo sobre fondo liso? También se ajusta entero en `auto`. */
  readonly esLogotipo?: boolean;
  /**
   * Un SVG ya saneado (sólo vectores). Si viene, se incrusta como vector; si no, se usa `datos`.
   * Lo sanea quien lo carga; aquí sólo se descarta lo evidentemente activo.
   */
  readonly svg?: string;
  /** Un `data:image/...;base64,...` (png, jpeg, webp, gif o svg). */
  readonly datos?: string;
}

export interface OpcionesDeLogo {
  /** Lado de la ventana como % del lado del código, de 8 a 30. Por omisión 24. */
  readonly tamano?: number;
  /** Lado de la ventana en módulos enteros; manda sobre `tamano`. */
  readonly modulosDeLado?: number;
  /** De 50 a 400 %. Por omisión 100. */
  readonly zoom?: number;
  /** Desplazamiento de la imagen: en % del recorrido posible (-100 a 100) o en módulos. */
  readonly x?: number;
  readonly y?: number;
  readonly ajuste?: AjusteDeLogo;
  readonly forma?: FormaDeVentana;
  readonly anclarADesplazamiento?: boolean;
  readonly modoDeDesplazamiento?: ModoDeDesplazamiento;
}

export interface GeometriaDeLogo {
  /** Lado de la ventana, en módulos enteros. */
  readonly lado: number;
  /** Esquina superior izquierda de la ventana, ya contando el margen. */
  readonly inicio: number;
  /** Posición y tamaño de la imagen dentro del lienzo. */
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
  /** Cuánto se puede mover la imagen a cada lado sin dejar la ventana vacía. */
  readonly recorridoX: number;
  readonly recorridoY: number;
  /** Radio de las esquinas de la ventana. */
  readonly radio: number;
  readonly ajuste: Exclude<AjusteDeLogo, 'auto'>;
}

export interface OpcionesDeFragmento {
  readonly fondo?: string;
  readonly primerPlano?: string;
  readonly fusion?: FusionDeLogo;
}

const TAMANO_MINIMO = 8;
const TAMANO_MAXIMO = 30;
const TAMANO_POR_OMISION = 24;
const ZOOM_MINIMO = 50;
const ZOOM_MAXIMO = 400;
const MODULOS_MINIMOS = 2;
/** La ventana nunca pasa de este tanto del lado del código. */
const PROPORCION_MAXIMA = 0.3;
/** Al menos esta fracción de la imagen se queda dentro de la ventana en los extremos. */
const FRACCION_VISIBLE = 0.25;
const RADIO_REDONDEADO = 0.16;

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

function exigirDimensiones(imagen: ImagenLogo): void {
  const validas = [imagen.ancho, imagen.alto].every(
    (medida) => Number.isFinite(medida) && medida > 0,
  );
  if (!validas) throw new RangeError('El logo debe tener ancho y alto positivos.');
}

/**
 * Dónde cae la ventana y la imagen. El lado de la ventana y su posición dependen sólo de la
 * matriz, no de la imagen ni del zoom: mover o ampliar la imagen nunca mueve la ventana.
 */
export function geometriaDeLogo(
  matriz: MatrizQr,
  margen: number,
  imagen: ImagenLogo,
  opciones: OpcionesDeLogo = {},
): GeometriaDeLogo {
  exigirDimensiones(imagen);
  const {
    tamano = TAMANO_POR_OMISION,
    modulosDeLado,
    zoom = 100,
    x = 0,
    y = 0,
    ajuste = 'auto',
    forma = 'square',
    anclarADesplazamiento = false,
    modoDeDesplazamiento = 'percent',
  } = opciones;
  const porcentaje = limitar(tamano, TAMANO_MINIMO, TAMANO_MAXIMO);
  const lado = limitar(
    Math.round(modulosDeLado ?? (matriz.tamano * porcentaje) / 100),
    MODULOS_MINIMOS,
    Math.floor(matriz.tamano * PROPORCION_MAXIMA),
  );
  const inicio = margen + Math.floor((matriz.tamano - lado) / 2);
  const resuelto: GeometriaDeLogo['ajuste'] =
    ajuste === 'auto'
      ? imagen.transparente === true || imagen.esLogotipo === true
        ? 'contain'
        : 'cover'
      : ajuste;
  const proporcion =
    resuelto === 'cover'
      ? Math.max(lado / imagen.ancho, lado / imagen.alto)
      : Math.min(lado / imagen.ancho, lado / imagen.alto);
  const escala = (proporcion * limitar(zoom, ZOOM_MINIMO, ZOOM_MAXIMO)) / 100;
  const ancho = imagen.ancho * escala;
  const alto = imagen.alto * escala;
  const recorridoX = (ancho + lado) / 2 - Math.min(ancho, lado) * FRACCION_VISIBLE;
  const recorridoY = (alto + lado) / 2 - Math.min(alto, lado) * FRACCION_VISIBLE;
  const enModulos = anclarADesplazamiento || modoDeDesplazamiento === 'modules';
  const desplazar = (valor: number, recorrido: number): number =>
    enModulos
      ? limitar(valor, -recorrido, recorrido)
      : (limitar(valor, -100, 100) / 100) * recorrido;
  return {
    lado,
    inicio,
    x: inicio + (lado - ancho) / 2 + desplazar(x, recorridoX),
    y: inicio + (lado - alto) / 2 + desplazar(y, recorridoY),
    ancho,
    alto,
    recorridoX,
    recorridoY,
    radio: forma === 'circle' ? lado / 2 : forma === 'rounded' ? lado * RADIO_REDONDEADO : 0,
    ajuste: resuelto,
  };
}

const DATOS_DE_IMAGEN = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
/** Lo que un SVG de logo jamás debe traer: script, contenido incrustado, manejadores, doctype. */
const MARCADO_ACTIVO =
  /<\s*(?:script|foreignObject|iframe|object|embed)\b|\son[a-z]+\s*=|javascript:|<!(?:DOCTYPE|ENTITY)/i;
const APERTURA_SVG = /<svg\b([^>]*)>/;
const ATRIBUTOS_DE_POSICION = /\s(?:x|y|width|height)="[^"]*"/g;

/** Pone el SVG del logo en su sitio y tamaño reescribiendo sólo su etiqueta de apertura. */
function incrustarVector(svg: string, g: GeometriaDeLogo): string {
  if (MARCADO_ACTIVO.test(svg)) {
    throw new Error('El SVG del logo trae elementos activos; sólo se admiten vectores.');
  }
  const apertura = APERTURA_SVG.exec(svg);
  if (apertura === null) throw new Error('El logo vectorial no contiene un elemento <svg>.');
  const otros = (apertura[1] ?? '').replace(ATRIBUTOS_DE_POSICION, '');
  const etiqueta = `<svg x="${formatearNumero(g.x)}" y="${formatearNumero(g.y)}" width="${formatearNumero(g.ancho)}" height="${formatearNumero(g.alto)}"${otros}>`;
  return svg.slice(0, apertura.index) + etiqueta + svg.slice(apertura.index + apertura[0].length);
}

function incrustarMapaDeBits(datos: string, g: GeometriaDeLogo): string {
  if (!DATOS_DE_IMAGEN.test(datos)) {
    throw new Error('El logo debe ser un data:image/(png|jpeg|webp|gif|svg+xml);base64.');
  }
  return `<image x="${formatearNumero(g.x)}" y="${formatearNumero(g.y)}" width="${formatearNumero(g.ancho)}" height="${formatearNumero(g.alto)}" href="${escaparXml(datos)}" preserveAspectRatio="none"/>`;
}

function dibujoDelLogo(imagen: ImagenLogo, g: GeometriaDeLogo): string {
  if (imagen.svg !== undefined && imagen.svg !== '') return incrustarVector(imagen.svg, g);
  if (imagen.datos === undefined) throw new Error('El logo necesita `svg` o `datos`.');
  return incrustarMapaDeBits(imagen.datos, g);
}

/**
 * El fragmento SVG del logo, listo para ir al final del cuerpo del QR: una ventana recortada
 * (`clip-path`) con el fondo y la imagen, y una máscara que deja ver los módulos protegidos que
 * caigan dentro. Con `fusion: 'weave'` los demás módulos se tejen por encima de la imagen.
 */
export function fragmentoDeLogo(
  matriz: MatrizQr,
  margen: number,
  imagen: ImagenLogo,
  g: GeometriaDeLogo,
  opciones: OpcionesDeFragmento = {},
): string {
  const fondo = exigirColor(opciones.fondo ?? '#ffffff', 'El fondo del logo');
  const primerPlano = exigirColor(opciones.primerPlano ?? '#000000', 'El color del QR');
  const posiciones = posicionesDeAlineacion(matriz.version);
  const lado = matriz.tamano + 2 * margen;
  const fin = g.inicio + g.lado;
  let protegidos = '';
  let nucleos = '';
  for (let y = 0; y < matriz.tamano; y++) {
    for (let x = 0; x < matriz.tamano; x++) {
      const fueraDeLaVentana =
        x + margen + 1 <= g.inicio ||
        y + margen + 1 <= g.inicio ||
        x + margen >= fin ||
        y + margen >= fin;
      if (fueraDeLaVentana) continue;
      if (esModuloProtegido(matriz, x, y, posiciones)) {
        protegidos += `<rect x="${x + margen}" y="${y + margen}" width="1" height="1" fill="#000"/>`;
      } else if (opciones.fusion === 'weave') {
        const color = matriz.modulo(x, y) ? primerPlano : fondo;
        nucleos += `<rect x="${formatearNumero(x + margen + 0.14)}" y="${formatearNumero(y + margen + 0.14)}" width=".72" height=".72" fill="${color}"/>`;
      }
    }
  }
  const ventana = `x="${g.inicio}" y="${g.inicio}" width="${g.lado}" height="${g.lado}"`;
  const definiciones =
    `<defs><clipPath id="image-window"><rect ${ventana} rx="${formatearNumero(g.radio)}"/></clipPath>` +
    `<mask id="image-safe" maskUnits="userSpaceOnUse" x="0" y="0" width="${lado}" height="${lado}">` +
    `<rect width="${lado}" height="${lado}" fill="#fff"/>${protegidos}</mask></defs>`;
  return `${definiciones}<g clip-path="url(#image-window)" mask="url(#image-safe)"><rect ${ventana} fill="${fondo}"/>${dibujoDelLogo(imagen, g)}${nucleos}</g>`;
}
