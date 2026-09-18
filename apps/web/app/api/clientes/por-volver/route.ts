import { clientesPorVolver } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-951 · A quien le toca volver, segun SU ritmo y no segun un promedio.
 *
 * Una clienta de tinte cada cinco semanas y una de corte cada cuatro meses no
 * se atrasan igual: un umbral unico las mete a las dos en la misma lista
 * equivocada, y entonces la lista no se usa.
 */
export const POST = manejadorDeComando(clientesPorVolver);

export const runtime = 'nodejs';
