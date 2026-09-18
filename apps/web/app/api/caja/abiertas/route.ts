import { cajasAbiertas } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-235 · Que cajas estan abiertas. Es la pregunta de las diez de la noche:
 * «¿quien no ha cerrado?».
 */
export const POST = manejadorDeComando(cajasAbiertas);

export const runtime = 'nodejs';
