/**
 * LOS OJOS: LOS TRES BUSCADORES DE LAS ESQUINAS.
 *
 * Un buscador son tres capas concéntricas de 7 × 7, 5 × 5 y 3 × 3 módulos: un anillo oscuro, un
 * hueco claro y un centro oscuro. Aquí se dibujan las tres como rutas; quien las pinta usa el
 * color de los ojos para el anillo y el centro, y el del fondo para el hueco. Las formas pueden
 * ser caprichosas, pero las proporciones no: de ellas depende que el lector encuentre el código.
 */

import type { IdEstiloCentro, IdEstiloOjo } from './catalogo.ts';
import { poligono, rectangulo, type Radios, type Ruta } from './ruta.ts';

/** Anillo, hueco y centro, en el orden en que se pintan. */
export type RutasDeOjo = readonly [anillo: Ruta, hueco: Ruta, centro: Ruta];

/** Cuánto se achica el radio del hueco respecto al del anillo exterior (el anillo mide 1 módulo). */
const AJUSTE_DEL_HUECO = 0.8;

/** Radio del anillo exterior según el estilo, en módulos. El octágono no usa radios. */
const RADIO_DEL_ANILLO: Readonly<Record<Exclude<IdEstiloOjo, 'octagon'>, Radios>> = {
  square: 0,
  rounded: 0.85,
  'extra-rounded': 1.9,
  circle: 3.5,
  classy: [2.1, 0, 2.1, 0],
  leaf: [0, 2.4, 0, 2.4],
  outpoint: [0, 1.7, 1.7, 1.7],
  inpoint: [1.7, 1.7, 0, 1.7],
};

const OCTAGONO_EXTERIOR = [
  [0.13, 0],
  [0.87, 0],
  [1, 0.13],
  [1, 0.87],
  [0.87, 1],
  [0.13, 1],
  [0, 0.87],
  [0, 0.13],
] as const;

const OCTAGONO_INTERIOR = [
  [0.11, 0],
  [0.89, 0],
  [1, 0.11],
  [1, 0.89],
  [0.89, 1],
  [0.11, 1],
  [0, 0.89],
  [0, 0.11],
] as const;

/** El octágono de los centros: un poco más recortado que el de los anillos. */
const OCTAGONO_DEL_CENTRO = [
  [0.18, 0],
  [0.82, 0],
  [1, 0.18],
  [1, 0.82],
  [0.82, 1],
  [0.18, 1],
  [0, 0.82],
  [0, 0.18],
] as const;

function restarRadio(radios: Radios, resta: number): Radios {
  if (typeof radios === 'number') return Math.max(0, radios - resta);
  const [a, b, c, d] = radios;
  return [
    Math.max(0, a - resta),
    Math.max(0, b - resta),
    Math.max(0, c - resta),
    Math.max(0, d - resta),
  ];
}

/** Radio de las esquinas del centro de 3 × 3 (lado `lado`) según su estilo. */
function radioDelCentro(lado: number, estilo: Exclude<IdEstiloCentro, 'octagon'>): Radios {
  switch (estilo) {
    case 'circle':
      return lado / 2;
    case 'rounded':
      return lado * 0.18;
    case 'extra-rounded':
      return lado * 0.34;
    case 'classy':
      return [lado * 0.45, 0, lado * 0.45, 0];
    case 'leaf':
      return [0, lado * 0.45, 0, lado * 0.45];
    case 'square':
      return 0;
  }
}

function rutaDelCentro(x: number, y: number, lado: number, estilo: IdEstiloCentro): Ruta {
  if (estilo === 'octagon') return poligono(x, y, lado, lado, OCTAGONO_DEL_CENTRO);
  return rectangulo(x, y, lado, lado, radioDelCentro(lado, estilo));
}

/**
 * Las tres capas de un buscador cuya esquina superior izquierda está en el módulo (x, y).
 *
 * @param ojo la forma del anillo.
 * @param centro la forma del cuadro de 3 × 3; ver `centrosCompatibles` para las que conservan
 *   las proporciones con cada anillo.
 */
export function rutasDeOjo(
  x: number,
  y: number,
  ojo: IdEstiloOjo,
  centro: IdEstiloCentro,
): RutasDeOjo {
  const rutaCentro = rutaDelCentro(x + 2, y + 2, 3, centro);
  if (ojo === 'octagon') {
    return [
      poligono(x, y, 7, 7, OCTAGONO_EXTERIOR),
      poligono(x + 1, y + 1, 5, 5, OCTAGONO_INTERIOR),
      rutaCentro,
    ];
  }
  const radio = RADIO_DEL_ANILLO[ojo];
  return [
    rectangulo(x, y, 7, 7, radio),
    rectangulo(x + 1, y + 1, 5, 5, restarRadio(radio, AJUSTE_DEL_HUECO)),
    rutaCentro,
  ];
}
