/**
 * DE LA MATRIZ AL SVG: LA ORQUESTACIÓN.
 *
 * Un QR se arma en capas, de adentro hacia afuera: el código con su estilo y su tinta, encima el
 * logo del centro si lo hay, y alrededor el marco si lo hay. Cada capa vive en su módulo; esto
 * sólo decide el orden y pasa a la siguiente lo que ella necesita. Puro: la misma matriz con las
 * mismas opciones da siempre el mismo texto.
 */

import { geometriaDeLogo, fragmentoDeLogo } from './logo.ts';
import type { MatrizQr } from './matriz.ts';
import { marcoSvg } from './marcos/marco-svg.ts';
import { resolverOpciones, type OpcionesQr, type OpcionesResueltas } from './opciones.ts';
import { cuerpoDelQr, envolverSvg, type CuerpoSvg } from './svg.ts';

/** El código y, encima, la ventana del logo si se pidió. */
function cuerpoConLogo(matriz: MatrizQr, base: CuerpoSvg, opciones: OpcionesResueltas): CuerpoSvg {
  const { logo, margen, fondo, primerPlano } = opciones;
  if (logo === undefined) return base;
  const geometria = geometriaDeLogo(matriz, margen, logo.imagen, logo);
  const fragmento = fragmentoDeLogo(matriz, margen, logo.imagen, geometria, {
    fondo: logo.fondo ?? fondo,
    primerPlano,
    fusion: logo.fusion ?? 'integrated',
  });
  return { lado: base.lado, marcado: base.marcado + fragmento };
}

/**
 * El SVG de un QR con el diseño pedido. Empieza con `<svg`, trae `viewBox` y no depende de nada
 * fuera de sí mismo salvo de los ids de sus degradados y máscaras: si va a convivir con otros QR
 * en una página, pásale el resultado a `prefijarIds`.
 *
 * @throws {RangeError} si una opción no es válida (color, tamaño, id de estilo o de marco).
 * @throws {Error} si el logo trae un SVG con elementos activos o datos que no son una imagen.
 */
export function renderizarQrSvg(matriz: MatrizQr, opciones: OpcionesQr = {}): string {
  const resueltas = resolverOpciones(opciones);
  const base = cuerpoDelQr(
    matriz,
    { modulo: resueltas.modulo, ojo: resueltas.ojo, centro: resueltas.centro },
    resueltas.margen,
    {
      primerPlano: resueltas.primerPlano,
      fondo: resueltas.fondo,
      ojos: resueltas.ojos,
      degradado: resueltas.degradado,
    },
  );
  const cuerpo = cuerpoConLogo(matriz, base, resueltas);
  return resueltas.marco === undefined
    ? envolverSvg(cuerpo, resueltas.tamano)
    : marcoSvg(cuerpo, resueltas.marco, resueltas.fondo, resueltas.tamano);
}
