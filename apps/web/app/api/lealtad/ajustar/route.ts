import { ajustarSellos } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-930 · Corregir sellos a mano, con motivo obligatorio.
 *
 * Sólo mandos: un ajuste de sellos es dinero regalado, y el cajero ya tiene el
 * comando de otorgar para lo que sí es una venta.
 */
export const POST = manejadorDeComando(ajustarSellos);

export const runtime = 'nodejs';
