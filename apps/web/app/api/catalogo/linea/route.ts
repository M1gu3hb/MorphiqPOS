import { declararLinea } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-021 · La linea lleva el ESQUEMA de atributos, y no el producto.
 *
 * Si cada alta inventa sus claves -«diametro», «diametro», «O»- la busqueda por
 * medida deja de existir al tercer mes. Y un atributo de lista sin opciones es
 * un campo libre con otro nombre: se rechaza, porque la busqueda por acabado
 * muere igual.
 */
export const POST = manejadorDeComando(declararLinea);

export const runtime = 'nodejs';
