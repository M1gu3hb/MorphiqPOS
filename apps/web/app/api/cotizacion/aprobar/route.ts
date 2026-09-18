import { registrarAprobacion } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-603 · El cliente dijo que si. Solo se aprueba lo que se MANDO.
 */
export const POST = manejadorDeComando(registrarAprobacion);

export const runtime = 'nodejs';
