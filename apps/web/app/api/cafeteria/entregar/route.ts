import { entregarPedidoDeBarra } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(entregarPedidoDeBarra);

export const runtime = 'nodejs';
