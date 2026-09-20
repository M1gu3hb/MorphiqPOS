import { registrarSurtido } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-605 · El surtido parcial, que es el caso normal: se entrega en tres viajes
 * porque nunca esta todo.
 */
export const POST = manejadorDeComando(registrarSurtido);

export const runtime = 'nodejs';
