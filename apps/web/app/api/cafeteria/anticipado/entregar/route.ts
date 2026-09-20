import { entregarAnticipado } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-330 · La entrega del anticipado, distinta de la del mostrador.
 *
 * `cafeteria/entregar-pedido` entrega lo de la fila normal. El anticipado tiene su
 * propio cierre porque ya estaba cobrado, y sin ruta quedaba abierto para siempre.
 */
export const POST = manejadorDeComando(entregarAnticipado);

export const runtime = 'nodejs';
