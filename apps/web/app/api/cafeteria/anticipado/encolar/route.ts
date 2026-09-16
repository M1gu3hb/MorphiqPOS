import { encolarPedido } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-330 · El pedido anticipado entra a la fila a su hora, no al pedirse.
 *
 * Encolar es lo que convierte «lo quiero a las 8:15» en un pedido que la barra
 * ve. Sin ruta, el pedido anticipado se podia crear y nunca llegaba a la fila.
 */
export const POST = manejadorDeComando(encolarPedido);

export const runtime = 'nodejs';
