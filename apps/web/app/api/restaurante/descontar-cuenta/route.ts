import { descontarCuenta } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-205 · El descuento de la cuenta de una mesa, con su tope y, arriba de él, el PIN del
 * supervisor. El restaurante no tenía ninguno (día completo del restaurante, 2.4).
 */
export const POST = manejadorDeComando(descontarCuenta);

export const runtime = 'nodejs';
