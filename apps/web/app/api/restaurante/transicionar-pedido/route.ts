import { transicionarPedido } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E6-6 · cambio de estado con versión monotónica. */
export const POST = manejadorDeComando(transicionarPedido);

export const runtime = 'nodejs';
