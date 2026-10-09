import { convertirCotizacionEnNota } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-604 · La cotización ganada se convierte en venta: una nota en la caja con los precios
 * cotizados, y la cotización ganada con su orden, en una sola transacción.
 */
export const POST = manejadorDeComando(convertirCotizacionEnNota);

export const runtime = 'nodejs';
