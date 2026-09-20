import { programarPedido } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-330 · Programar el pedido de las 8:15.
 *
 * La orden ya viene COBRADA: una reserva sin prenda es el no-show, y un no-show
 * de seis cafés en la hora pico es media hora de barra tirada.
 */
export const POST = manejadorDeComando(programarPedido);

export const runtime = 'nodejs';
