import { abrirProducto } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-155 · Abrir una pieza para cabina. Sale una pieza del anaquel y entran
 * `factor_apertura` unidades del insumo base en el de cabina: es un traspaso,
 * no un mecanismo nuevo.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar.
 */
export const POST = manejadorDeComandoConParametro(abrirProducto, 'productoId');

export const runtime = 'nodejs';
