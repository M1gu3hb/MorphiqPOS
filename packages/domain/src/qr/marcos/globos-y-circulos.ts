/**
 * MARCOS DE GLOBO, FLECHA Y CÍRCULO.
 *
 * Los globos señalan al QR con una colita; las flechas, con un trazo; los círculos lo encierran
 * en una órbita, un anillo de puntos o una mancha orgánica.
 */

import type { Dibujo, DibujosDe } from './tipos.ts';

const GLOBO =
  'M18 2H98Q114 2 114 18V112Q114 129 98 129H77Q71 145 45 153L51 129H18Q2 129 2 112V18Q2 2 18 2Z';
const MANCHA_ORGANICA =
  'M80 2C104-4 114 21 132 28S164 44 156 71s10 43-16 56-25 38-53 28-45 12-58-20S-1 106 4 78s-7-43 23-51S51 1 80 2Z';
const PUNTOS_DEL_ANILLO = 60;

/** Un globo; el macizo va relleno con texto claro y el otro es sólo contorno. */
function globo(macizo: boolean): Dibujo {
  return ({ ruta, relleno, fondo, tinta, claro, principal, texto }) => ({
    alto: 155,
    decoracion: ruta(GLOBO, macizo ? relleno : fondo, macizo ? null : tinta, 3),
    rotulos: texto(principal, 58, 119, 92, macizo ? claro : tinta, 6.5),
  });
}

/** Un rótulo en una pestaña de tinta con colita, arriba a la derecha o a la izquierda. */
function globoSuperior(colita: string): Dibujo {
  return ({ rect, ruta, relleno, claro, principal, texto }) => ({
    alto: 140,
    y: 38,
    decoracion: rect(1, 1, 114, 25, relleno, 6) + ruta(colita),
    rotulos: texto(principal, 58, 14, 99, claro, 8),
  });
}

/** Sesenta puntitos de 0.7 de radio sobre una circunferencia de radio 73. */
function anilloDePuntos(
  circulo: (cx: number, cy: number, r: number, color: string) => string,
  tinta: string,
): string {
  return Array.from({ length: PUNTOS_DEL_ANILLO }, (_, i) => {
    const angulo = (i * Math.PI * 2) / PUNTOS_DEL_ANILLO;
    return circulo(80 + Math.cos(angulo) * 73, 80 + Math.sin(angulo) * 73, 0.7, tinta);
  }).join('');
}

export const GLOBOS_Y_CIRCULOS: DibujosDe<
  | 'speech'
  | 'bubble-outline'
  | 'bubble-top-right'
  | 'bubble-top-left'
  | 'bubble-bottom'
  | 'label-pointer'
  | 'arrow-curved'
  | 'circle'
  | 'circle-dots'
  | 'organic'
  | 'circle-shadow'
> = {
  speech: globo(true),
  'bubble-outline': globo(false),
  'bubble-top-right': globoSuperior('M77 25l13 13V25Z'),
  'bubble-top-left': globoSuperior('M11 25v13l13-13Z'),
  'bubble-bottom': ({ rect, ruta, relleno, claro, principal, texto }) => ({
    alto: 139,
    y: 1,
    decoracion: rect(8, 115, 100, 22, relleno, 4) + ruta('M21 115v-13l13 13Z'),
    rotulos: texto(principal, 58, 127, 88, claro, 8),
  }),
  'label-pointer': ({ rect, ruta, telefono, fondo, tinta, principal, texto }) => ({
    alto: 145,
    y: 1,
    decoracion:
      rect(8, 123, 100, 20, fondo, 4, tinta, 1.5) +
      ruta('M53 117l5-5 5 5M53 112l5-5 5 5', 'none', tinta, 1) +
      telefono(15, 128, 6, 10, tinta, 0.8),
    rotulos: texto(principal, 62, 133, 78, tinta, 7),
  }),
  'arrow-curved': ({ ruta, tinta, principal, texto }) => ({
    ancho: 196,
    alto: 125,
    x: 92,
    y: 10,
    decoracion: ruta('M5 84C4 38 27 18 63 17V7L88 25 62 43V31C30 29 16 51 16 83Z'),
    rotulos: texto(principal, 46, 94, 76, tinta, 14, 2),
  }),
  circle: ({ circulo, fondo, tinta, principal, texto }) => ({
    ancho: 160,
    alto: 160,
    x: 30,
    y: 30,
    decoracion: circulo(80, 80, 78, fondo, tinta, 2),
    rotulos: texto(principal, 80, 143, 88, tinta, 7),
  }),
  'circle-dots': ({ circulo, fondo, tinta, principal, texto }) => ({
    ancho: 160,
    alto: 160,
    x: 30,
    y: 30,
    decoracion: circulo(80, 80, 78, fondo, tinta, 1.5) + anilloDePuntos(circulo, tinta),
    rotulos: texto(principal, 80, 143, 88, tinta, 7),
  }),
  organic: ({ ruta, claro, principal, texto }) => ({
    ancho: 160,
    alto: 160,
    x: 30,
    y: 30,
    decoracion: ruta(MANCHA_ORGANICA),
    rotulos: texto(principal, 80, 143, 88, claro, 7),
  }),
  'circle-shadow': ({ ruta, circulo, relleno, claro, principal, secundario, texto }) => ({
    ancho: 160,
    alto: 160,
    x: 30,
    y: 27,
    decoracion:
      circulo(80, 80, 79, relleno) + ruta('M130 26L159 69V104L103 158 30 128V26Z', '#00000055'),
    rotulos: texto(secundario, 80, 15, 73, claro, 4.5, 1) + texto(principal, 80, 143, 80, claro, 7),
  }),
};
