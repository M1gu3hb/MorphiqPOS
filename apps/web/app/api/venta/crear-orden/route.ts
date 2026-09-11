import { crearOrden } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(crearOrden);

export const runtime = 'nodejs';
