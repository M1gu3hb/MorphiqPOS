import { suspenderVenta } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-224 · La venta que se aparta para atender a otro.
 *
 * Suspender NO es cancelar: cancelar deja la orden muerta y su folio quemado,
 * suspender la deja viva con sus lineas, su descuento autorizado y su cliente
 * identificado -que es justo lo que costo tiempo-.
 *
 * Y NO mueve inventario: el descuento cuelga del cobro, y esta no se cobro.
 * Descontar aqui dejaria el anaquel corto mientras el cliente busca el pan, y
 * corto para siempre si no vuelve.
 */
export const POST = manejadorDeComando(suspenderVenta);

export const runtime = 'nodejs';
