import { abrirCajon } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-984 · Abrir el cajon SIN venta. Es la unica apertura que puede esconder
 * un faltante: la del cobro la dispara el cobro y tiene su ticket detras.
 */
export const POST = manejadorDeComando(abrirCajon);

export const runtime = 'nodejs';
