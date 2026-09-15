import { llamarPedido } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(llamarPedido);

export const runtime = 'nodejs';
