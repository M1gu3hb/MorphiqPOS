import { registrarRemision } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-606 · La remisión de entrega, que es el documento más importante del día
 * y hasta hoy no existía en el sistema. */
export const POST = manejadorDeComando(registrarRemision);

export const runtime = 'nodejs';
