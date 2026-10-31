/**
 * EL SVG DEL CÓDIGO, SIN LOGO NI MARCO.
 *
 * Se arma en dos pasos a propósito. `cuerpoDelQr` devuelve lo que va DENTRO del `<svg>` y `lado`,
 * porque el logo se apila encima de ese cuerpo y el marco lo mete entero en su propio dibujo;
 * `envolverSvg` pone el documento alrededor. Todo en unidades de módulo: el `viewBox` es el lado
 * del código más sus dos márgenes y el navegador escala a los píxeles que pida `width`.
 */

import type { IdEstiloCentro, IdEstiloModulo, IdEstiloOjo } from './catalogo.ts';
import { definicionDeLaTinta, rellenoDeLaTinta, type Degradado } from './degradados.ts';
import type { MatrizQr } from './matriz.ts';
import { rutasDeOjo } from './ojos.ts';
import { LADO_DEL_BUSCADOR } from './protegidos.ts';
import { rutaSvg } from './ruta.ts';
import { rutaDeDatos } from './estilos-de-modulos.ts';

export interface EstiloDeQr {
  readonly modulo: IdEstiloModulo;
  readonly ojo: IdEstiloOjo;
  readonly centro: IdEstiloCentro;
}

export interface ColoresDeQr {
  readonly primerPlano: string;
  readonly fondo: string;
  readonly ojos: string;
  readonly degradado?: Degradado | undefined;
}

/** El interior de un `<svg>` y el lado, en módulos, del lienzo que ocupa. */
export interface CuerpoSvg {
  readonly lado: number;
  readonly marcado: string;
}

export const ESPACIO_DE_NOMBRES_SVG = 'http://www.w3.org/2000/svg';

/** Esquina superior izquierda de cada buscador, ya contando el margen. */
function esquinasDeLosOjos(
  matriz: MatrizQr,
  margen: number,
): readonly (readonly [number, number])[] {
  const lejos = margen + matriz.tamano - LADO_DEL_BUSCADOR;
  return [
    [margen, margen],
    [lejos, margen],
    [margen, lejos],
  ];
}

/**
 * Fondo, módulos de datos y los tres ojos. El hueco de cada ojo se pinta con el color del fondo
 * en vez de recortarse.
 */
export function cuerpoDelQr(
  matriz: MatrizQr,
  estilo: EstiloDeQr,
  margen: number,
  colores: ColoresDeQr,
): CuerpoSvg {
  const lado = matriz.tamano + margen * 2;
  const relleno = rellenoDeLaTinta(colores.primerPlano, colores.degradado);
  const definiciones = definicionDeLaTinta(colores.primerPlano, colores.degradado, lado);
  const datos = `<path d="${rutaSvg(rutaDeDatos(matriz, estilo.modulo, margen))}" fill="${relleno}"/>`;
  const ojos = esquinasDeLosOjos(matriz, margen)
    .flatMap(([x, y]) => rutasDeOjo(x, y, estilo.ojo, estilo.centro))
    .map((ruta, i) => {
      const esHueco = i % 3 === 1;
      return `<path d="${rutaSvg(ruta)}" fill="${esHueco ? colores.fondo : colores.ojos}"/>`;
    })
    .join('');
  const marcado = `${definiciones}<rect width="${lado}" height="${lado}" fill="${colores.fondo}"/>${datos}${ojos}`;
  return { lado, marcado };
}

/** El documento SVG completo, cuadrado, de `tamano` píxeles por lado. */
export function envolverSvg(cuerpo: CuerpoSvg, tamano: number): string {
  return `<svg xmlns="${ESPACIO_DE_NOMBRES_SVG}" width="${tamano}" height="${tamano}" viewBox="0 0 ${cuerpo.lado} ${cuerpo.lado}">${cuerpo.marcado}</svg>`;
}
