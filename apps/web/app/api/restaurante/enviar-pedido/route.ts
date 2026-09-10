import { enviarPedido } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E6-4 · líneas, comandas e items en la MISMA transacción. */
export const POST = manejadorDeComando(enviarPedido);

export const runtime = 'nodejs';
