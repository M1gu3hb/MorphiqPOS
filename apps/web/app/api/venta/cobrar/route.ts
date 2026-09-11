import { cobrarOrden } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(cobrarOrden);

export const runtime = 'nodejs';
