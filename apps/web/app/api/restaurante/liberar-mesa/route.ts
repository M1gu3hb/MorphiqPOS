import { liberarMesa } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** El recíproco de abrir: falla si la cuenta sigue sin cobrar. */
export const POST = manejadorDeComando(liberarMesa);

export const runtime = 'nodejs';
