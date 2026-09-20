import { devolverPedido } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-262 · La tercera salida del cierre de turno: devolverle el dinero.
 *
 * El diálogo que impide cerrar el turno con pedidos en la fila ofrece tres
 * salidas. Las dos primeras existían; ésta publicaba aquí y **no existía**, y la
 * pantalla lo decía en un comentario. Sin ella, el barista que cierra con un café
 * pagado y sin dueño tenía dos salidas y ninguna era la correcta: «entregarlo»
 * miente y «nadie vino» deja el dinero cobrado sin devolver.
 *
 * Saca el efectivo del cajón con su renglón, deja los pagos en «reembolsado» —para
 * que el corte no cuente una venta que se devolvió— y no toca el inventario: la
 * bebida se hizo.
 */
export const POST = manejadorDeComando(devolverPedido);

export const runtime = 'nodejs';
