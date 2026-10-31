/**
 * LO QUE UN DISEÑO DE MARCO DEVUELVE.
 *
 * Cada diseño dibuja en una cuadrícula canónica de 100 unidades y dice dónde cae el QR en ella.
 * Lo que no diga lo pone `marcoSvg`: un marco de 116 × 140 con el QR en (8, 8), que es lo más
 * común. El QR siempre mide 100 × 100 en esa cuadrícula y se dibuja ENTERO: ninguna decoración
 * entra a su zona de silencio.
 */

import type { IdMarco } from './catalogo.ts';
import type { Lienzo } from './lienzo.ts';

export interface DisenoDeMarco {
  /** Tamaño del marco, sin contar `izquierda`. Por omisión 116 × 140. */
  readonly ancho?: number;
  readonly alto?: number;
  /** Dónde cae la esquina superior izquierda del QR. Por omisión (8, 8). */
  readonly x?: number;
  readonly y?: number;
  /** Cuánto sobresale el dibujo por la izquierda del marco (una punta, una muesca). */
  readonly izquierda?: number;
  /** Las formas del marco, que van debajo del QR. */
  readonly decoracion: string;
  /** Los textos, que van encima de las formas. */
  readonly rotulos: string;
}

export type Dibujo = (lienzo: Lienzo) => DisenoDeMarco;

/** Los dibujos de un grupo de marcos: uno por id, ni uno de más ni uno de menos. */
export type DibujosDe<I extends IdMarco> = Readonly<Record<I, Dibujo>>;
