import { topeDeDescuento } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/** El tope de descuento de quien cobra y a quién pedirle el PIN si se pasa (F-205, D-28). */
export const POST = manejadorDeComando(topeDeDescuento);

export const runtime = 'nodejs';
