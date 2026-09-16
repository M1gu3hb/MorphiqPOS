import { registrarEnvio } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-602 · Se mando, y por donde. El envio de verdad es de otra capa; anotarlo
 * aqui es lo que permite preguntar a quien no se le ha marcado en cuatro dias.
 */
export const POST = manejadorDeComando(registrarEnvio);

export const runtime = 'nodejs';
