import { agregarPartida } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-061 · La pieza de la ficha, en la venta.
 *
 * El botón AGREGAR A LA VENTA publicaba aquí y **esto no existía**: se resolvía
 * la duda del cliente —la medida, el equivalente, la ubicación— y después había
 * que volver al mostrador y teclear la pieza otra vez.
 *
 * No recibe `ordenId` porque la ficha no tiene ninguna: se llega a ella desde la
 * búsqueda, no desde el carrito. La venta es la de esta terminal, y la terminal
 * sale de la sesión.
 */
export const POST = manejadorDeComando(agregarPartida);

export const runtime = 'nodejs';
