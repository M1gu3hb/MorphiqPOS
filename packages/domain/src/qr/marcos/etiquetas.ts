/**
 * MARCOS DE ETIQUETA: UNA BANDA, UNA CABECERA O UNA PASTILLA CON EL TEXTO.
 *
 * Son los más sencillos: un rectángulo de tinta con el QR encima o al lado y el texto en la parte
 * que queda libre.
 */

import type { Dibujo, DibujosDe } from './tipos.ts';

/** Un panel de tinta con el texto abajo; `band` y `rounded` sólo difieren en el radio. */
function bandaInferior(radio: number): Dibujo {
  return ({ rect, relleno, principal, texto }) => ({
    decoracion: rect(0, 0, 116, 140, relleno, radio),
    rotulos: texto(principal, 58, 125, 98),
  });
}

/** Una etiqueta suelta bajo el QR; `label-bottom` es rectangular y `label-pill` redonda. */
function etiquetaInferior(radio: number): Dibujo {
  return ({ rect, relleno, principal, texto }) => ({
    y: 2,
    decoracion: rect(14, 116, 88, 20, relleno, radio) + texto(principal, 58, 126, 78),
    rotulos: '',
  });
}

export const ETIQUETAS: DibujosDe<
  | 'band'
  | 'rounded'
  | 'top'
  | 'label-bottom'
  | 'label-pill'
  | 'tab-top'
  | 'inverse-caption'
  | 'scan-bold'
  | 'pill-side'
  | 'side'
> = {
  band: bandaInferior(5),
  rounded: bandaInferior(14),
  top: ({ rect, relleno, principal, texto }) => ({
    y: 32,
    decoracion: rect(0, 0, 116, 140, relleno, 5),
    rotulos: texto(principal, 58, 16, 98),
  }),
  'label-bottom': etiquetaInferior(3),
  'label-pill': etiquetaInferior(10),
  'tab-top': ({ rect, fondo, tinta, principal, texto }) => ({
    alto: 136,
    y: 28,
    decoracion:
      rect(3, 23, 110, 111, fondo, 2, tinta, 2) + rect(8, 1, 100, 22, fondo, 1, tinta, 1.5),
    rotulos: texto(principal, 58, 12, 91, tinta, 8),
  }),
  'inverse-caption': ({ rect, relleno, fondo, tinta, principal, texto }) => ({
    alto: 146,
    y: 33,
    decoracion: rect(0, 0, 116, 146, relleno, 4) + rect(0, 0, 116, 29, fondo),
    rotulos: texto(principal, 58, 14, 97, tinta, 8),
  }),
  'scan-bold': ({ rect, relleno, claro, principal, texto }) => ({
    alto: 164,
    decoracion: rect(0, 0, 116, 164, relleno, 8),
    rotulos: texto(principal, 58, 137, 94, claro, 18, 2),
  }),
  'pill-side': ({ rect, relleno, fondo, tinta, principal, texto }) => ({
    ancho: 230,
    alto: 116,
    x: 8,
    y: 8,
    decoracion: rect(76, 22, 151, 72, fondo, 11, tinta, 2) + rect(0, 0, 116, 116, relleno, 8),
    rotulos: texto(principal, 171, 58, 96, tinta, 10),
  }),
  side: ({ rect, relleno, claro, principal, texto }) => ({
    ancho: 142,
    alto: 116,
    decoracion: rect(0, 0, 142, 116, relleno, 7),
    rotulos: texto(principal, 126, 58, 94, claro, 8, 2, -90),
  }),
};
