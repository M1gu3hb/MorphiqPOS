import { altaCliente } from '@morphiqpos/app/clientes';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-040 · El alta del cliente. Dar de alta dos veces al mismo telefono
 * devuelve la ficha que ya hay: en el mostrador, «ese cliente ya existe» es un
 * callejon sin salida porque hay alguien esperando.
 */
export const POST = manejadorDeComando(altaCliente);

export const runtime = 'nodejs';
