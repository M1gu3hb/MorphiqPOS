/**
 * LA FORMA DE CADA MÓDULO DE DATOS.
 *
 * Los estilos «continuos» redondean sólo las esquinas que no tocan a un vecino oscuro, y por eso
 * la forma de un módulo depende de los cuatro que lo rodean. Las «redes» le suman puentes hacia
 * los vecinos. El resto (puntos, corazones) ignora a los vecinos. En todos los casos el módulo
 * cabe en su casilla de 1 × 1.
 */

import type { IdEstiloModulo } from './catalogo.ts';
import { posicionesDeAlineacion, type MatrizQr } from './matriz.ts';
import { esModuloProtegido, estaEnBuscador } from './protegidos.ts';
import { rectangulo, trasladar, type Esquinas, type Ruta } from './ruta.ts';

interface Vecinos {
  readonly arriba: boolean;
  readonly derecha: boolean;
  readonly abajo: boolean;
  readonly izquierda: boolean;
}

function vecinosDe(matriz: MatrizQr, x: number, y: number): Vecinos {
  return {
    arriba: matriz.modulo(x, y - 1),
    derecha: matriz.modulo(x + 1, y),
    abajo: matriz.modulo(x, y + 1),
    izquierda: matriz.modulo(x - 1, y),
  };
}

/** Radio de las esquinas libres de los estilos que sólo redondean donde no hay vecino. */
const RADIO_CONTINUO = {
  joined: 0.35,
  liquid: 0.5,
  organic: 0.44,
  bevel: 0.18,
  squircle: 0.27,
} as const;

type EstiloContinuo = keyof typeof RADIO_CONTINUO;

/** Un radio `r` en las esquinas cuyos dos lados no tienen vecino, y 0 en las demás. */
function esquinasLibres(v: Vecinos, libre: number, ocupada = 0): Esquinas {
  return [
    !v.arriba && !v.izquierda ? libre : ocupada,
    !v.arriba && !v.derecha ? libre : ocupada,
    !v.abajo && !v.derecha ? libre : ocupada,
    !v.abajo && !v.izquierda ? libre : ocupada,
  ];
}

function rutaContinua(x: number, y: number, v: Vecinos, estilo: EstiloContinuo): Ruta {
  return rectangulo(x, y, 1, 1, esquinasLibres(v, RADIO_CONTINUO[estilo]));
}

/** Cinta horizontal: se redondean los extremos que no continúan con un vecino. */
function rutaCintaHorizontal(x: number, y: number, v: Vecinos): Ruta {
  const izquierda = v.izquierda ? 0 : 0.46;
  const derecha = v.derecha ? 0 : 0.46;
  return rectangulo(x, y + 0.04, 1, 0.92, [izquierda, derecha, derecha, izquierda]);
}

function rutaCintaVertical(x: number, y: number, v: Vecinos): Ruta {
  const arriba = v.arriba ? 0 : 0.46;
  const abajo = v.abajo ? 0 : 0.46;
  return rectangulo(x + 0.04, y, 0.92, 1, [arriba, arriba, abajo, abajo]);
}

interface ParametrosDeRed {
  /** Lado del cuerpo central. */
  readonly cuerpo: number;
  readonly radio: number;
  /** Grosor del puente hacia un vecino. */
  readonly puente: number;
}

const REDES: Readonly<
  Record<'pipe' | 'round-bridge' | 'maze' | 'stitch' | 'soft-cross', ParametrosDeRed>
> = {
  pipe: { cuerpo: 0.76, radio: 0.24, puente: 0.76 },
  'round-bridge': { cuerpo: 0.76, radio: 0.76 / 2, puente: 0.62 },
  maze: { cuerpo: 0.84, radio: 0, puente: 0.84 },
  stitch: { cuerpo: 0.88, radio: 0.88 / 2, puente: 0.88 },
  'soft-cross': { cuerpo: 0.78, radio: 0.78 / 2, puente: 0.56 },
};

/** Un cuerpo central y, hacia cada vecino oscuro, un puente de media casilla. */
function rutaDeRed(x: number, y: number, v: Vecinos, estilo: keyof typeof REDES): Ruta {
  const { cuerpo, radio, puente } = REDES[estilo];
  const holgura = (1 - cuerpo) / 2;
  const centrado = (1 - puente) / 2;
  return [
    ...rectangulo(x + holgura, y + holgura, cuerpo, cuerpo, radio),
    ...(v.arriba ? rectangulo(x + centrado, y, puente, 0.5) : []),
    ...(v.abajo ? rectangulo(x + centrado, y + 0.5, puente, 0.5) : []),
    ...(v.izquierda ? rectangulo(x, y + centrado, 0.5, puente) : []),
    ...(v.derecha ? rectangulo(x + 0.5, y + centrado, 0.5, puente) : []),
  ];
}

/** Un corazón inscrito en la casilla de lado `lado`. */
function rutaDeCorazon(x: number, y: number, lado: number): Ruta {
  return [
    ['M', x + lado / 2, y + lado],
    ['C', x + lado * 0.42, y + lado * 0.92, x, y + lado * 0.57, x, y + lado * 0.28],
    ['C', x, y - lado * 0.03, x + lado * 0.34, y - lado * 0.08, x + lado / 2, y + lado * 0.2],
    ['C', x + lado * 0.66, y - lado * 0.08, x + lado, y - lado * 0.03, x + lado, y + lado * 0.28],
    ['C', x + lado, y + lado * 0.57, x + lado * 0.58, y + lado * 0.92, x + lado / 2, y + lado],
    ['Z'],
  ];
}

/** La ruta del módulo oscuro (x, y) con el estilo dado, en unidades de módulo. */
export function rutaDeModulo(matriz: MatrizQr, x: number, y: number, estilo: IdEstiloModulo): Ruta {
  const v = vecinosDe(matriz, x, y);
  switch (estilo) {
    case 'joined':
    case 'liquid':
    case 'organic':
    case 'bevel':
    case 'squircle':
      return rutaContinua(x, y, v, estilo);
    case 'extra-rounded':
      return rectangulo(x, y, 1, 1, esquinasLibres(v, 0.48));
    case 'classy':
      return rectangulo(x, y, 1, 1, [
        !v.arriba && !v.izquierda ? 0.5 : 0,
        0,
        !v.abajo && !v.derecha ? 0.5 : 0,
        0,
      ]);
    case 'classy-rounded':
      return rectangulo(x, y, 1, 1, [
        !v.arriba && !v.izquierda ? 0.5 : 0,
        !v.arriba && !v.derecha ? 0.22 : 0,
        !v.abajo && !v.derecha ? 0.5 : 0,
        !v.abajo && !v.izquierda ? 0.22 : 0,
      ]);
    case 'ribbon-h':
      return rutaCintaHorizontal(x, y, v);
    case 'ribbon-v':
      return rutaCintaVertical(x, y, v);
    case 'pipe':
    case 'round-bridge':
    case 'maze':
    case 'stitch':
    case 'soft-cross':
      return rutaDeRed(x, y, v, estilo);
    case 'heart':
      return rutaDeCorazon(x, y, 1);
    case 'dots':
      return rectangulo(x + 0.03, y + 0.03, 0.94, 0.94, 0.47);
    case 'square':
      return rectangulo(x, y, 1, 1);
  }
}

/**
 * Todos los módulos de datos del código en una sola ruta, ya desplazada por el margen. Los de
 * los buscadores no entran (los dibujan los ojos) y los protegidos salen cuadrados cualquiera
 * que sea el estilo.
 */
export function rutaDeDatos(matriz: MatrizQr, estilo: IdEstiloModulo, margen: number): Ruta {
  const posiciones = posicionesDeAlineacion(matriz.version);
  const comandos: Ruta[] = [];
  for (let y = 0; y < matriz.tamano; y++) {
    for (let x = 0; x < matriz.tamano; x++) {
      if (!matriz.modulo(x, y) || estaEnBuscador(matriz, x, y)) continue;
      const forma = esModuloProtegido(matriz, x, y, posiciones) ? 'square' : estilo;
      comandos.push(trasladar(rutaDeModulo(matriz, x, y, forma), margen, margen));
    }
  }
  return comandos.flat();
}
