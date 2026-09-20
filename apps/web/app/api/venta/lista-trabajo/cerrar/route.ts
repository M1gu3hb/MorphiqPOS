import { cerrarListaTrabajo } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-153 · Cerrar la lista, surtida o cancelada, siempre con fecha.
 */
export const POST = manejadorDeComando(cerrarListaTrabajo);

export const runtime = 'nodejs';
