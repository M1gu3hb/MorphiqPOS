import { devolverVenta } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/** D-29 · La devolución de una venta cobrada, total o parcial. */
export const POST = manejadorDeComando(devolverVenta);

export const runtime = 'nodejs';
