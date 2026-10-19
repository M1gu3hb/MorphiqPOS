import { ventaParaDevolver } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/** D-29 · La venta como la ve quien va a devolver: lo vendido, lo devuelto y lo disponible. */
export const POST = manejadorDeComando(ventaParaDevolver);

export const runtime = 'nodejs';
