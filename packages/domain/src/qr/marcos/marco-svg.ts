/**
 * EL MARCO ALREDEDOR DEL QR.
 *
 * El diseño del marco se dibuja en una cuadrícula canónica de 100 unidades, y el QR —que mide
 * `lado` módulos— se escala para caber exactamente en un cuadrado de 100 × 100 de ella. Así el
 * mismo diseño sirve para cualquier versión del código y el QR queda ENTERO: debajo de él sólo
 * va un panel del color del fondo, 2 unidades más grande que el código, y ninguna decoración
 * entra en su zona de silencio.
 */

import { formatearNumero } from '../ruta.ts';
import { ESPACIO_DE_NOMBRES_SVG, type CuerpoSvg } from '../svg.ts';
import { esIdMarco, type IdMarco } from './catalogo.ts';
import { CONTORNOS } from './contornos.ts';
import { ETIQUETAS } from './etiquetas.ts';
import { GLOBOS_Y_CIRCULOS } from './globos-y-circulos.ts';
import { crearLienzo, ID_DEL_RELLENO, type Lienzo, type OpcionesDeMarco } from './lienzo.ts';
import { SELLOS } from './sellos.ts';
import { TARJETAS_Y_DISPOSITIVOS } from './tarjetas-y-dispositivos.ts';
import type { DibujosDe } from './tipos.ts';

const DIBUJOS: DibujosDe<IdMarco> = {
  ...ETIQUETAS,
  ...CONTORNOS,
  ...SELLOS,
  ...GLOBOS_Y_CIRCULOS,
  ...TARJETAS_Y_DISPOSITIVOS,
};

/** Lado de la cuadrícula canónica que ocupa el QR. */
const LADO_CANONICO = 100;
const ANCHO_POR_OMISION = 116;
const ALTO_POR_OMISION = 140;
const POSICION_POR_OMISION = 8;
/** Cuánto sobresale el panel de fondo del QR por cada lado. */
const HOLGURA_DEL_PANEL = 2;
const RADIO_DEL_PANEL = 3;

function definicionDelRelleno({ tinta, acento }: Lienzo): string {
  return (
    `<defs><linearGradient id="${ID_DEL_RELLENO}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop stop-color="${tinta}"/><stop offset="1" stop-color="${acento}"/></linearGradient></defs>`
  );
}

/**
 * Un SVG con el QR (`cuerpo`) metido en el marco `opciones.tipo`.
 *
 * @param fondo el color de fondo del QR, que también es el de los paneles del marco.
 * @param tamano ancho en píxeles del SVG resultante; el alto sale de la proporción del marco.
 */
export function marcoSvg(
  cuerpo: CuerpoSvg,
  opciones: OpcionesDeMarco,
  fondo: string,
  tamano: number,
): string {
  // El tipo llega de fuera (una base de datos, un formulario): el compilador no lo garantiza.
  if (!esIdMarco(opciones.tipo)) {
    throw new RangeError(`«${String(opciones.tipo)}» no es un marco del catálogo.`);
  }
  const lienzo = crearLienzo(opciones, fondo);
  const diseno = DIBUJOS[opciones.tipo](lienzo);
  const ancho = diseno.ancho ?? ANCHO_POR_OMISION;
  const alto = diseno.alto ?? ALTO_POR_OMISION;
  const x = diseno.x ?? POSICION_POR_OMISION;
  const y = diseno.y ?? POSICION_POR_OMISION;
  const izquierda = diseno.izquierda ?? 0;
  const unidad = cuerpo.lado / LADO_CANONICO;
  const anchoTotal = (ancho + izquierda) * unidad;
  const altoTotal = alto * unidad;
  const panel = lienzo.rect(
    x - HOLGURA_DEL_PANEL,
    y - HOLGURA_DEL_PANEL,
    LADO_CANONICO + 2 * HOLGURA_DEL_PANEL,
    LADO_CANONICO + 2 * HOLGURA_DEL_PANEL,
    fondo,
    RADIO_DEL_PANEL,
  );
  const definiciones = opciones.degradado === true ? definicionDelRelleno(lienzo) : '';
  const altoEnPixeles = Math.round((tamano * alto) / (ancho + izquierda));
  return (
    `<svg xmlns="${ESPACIO_DE_NOMBRES_SVG}" width="${tamano}" height="${altoEnPixeles}" viewBox="0 0 ${formatearNumero(anchoTotal)} ${formatearNumero(altoTotal)}">` +
    `${definiciones}<rect width="${formatearNumero(anchoTotal)}" height="${formatearNumero(altoTotal)}" fill="${fondo}"/>` +
    `<g transform="scale(${formatearNumero(unidad)})"><g transform="translate(${izquierda} 0)">${diseno.decoracion}${panel}${diseno.rotulos}</g></g>` +
    `<g transform="translate(${formatearNumero((x + izquierda) * unidad)} ${formatearNumero(y * unidad)})">${cuerpo.marcado}</g>` +
    `</svg>`
  );
}
