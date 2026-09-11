import { agregarLinea } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(agregarLinea);

export const runtime = 'nodejs';
