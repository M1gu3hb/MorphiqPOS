import { abrirPieza } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-145 · El rollo abierto. NO es el inventario: es una descomposicion
 * informativa de lo que ya esta contado, y por eso abrir una pieza no mueve
 * stock -moverlo lo descontaria dos veces, al abrir y al cortar-.
 *
 * El folio es corto y legible porque se rotula con plumon en la cinta: nadie
 * copia un uuid a un rollo de cable.
 */
export const POST = manejadorDeComando(abrirPieza);

export const runtime = 'nodejs';
