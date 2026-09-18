import { loQueDebo } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-635 · Cuanto se debe, por tramos. Usa LA MISMA aritmetica que la cartera
 * de cobros: dos aritmeticas para el mismo concepto acaban dando numeros
 * distintos, y entonces ninguno se cree.
 */
export const POST = manejadorDeComando(loQueDebo);

export const runtime = 'nodejs';
