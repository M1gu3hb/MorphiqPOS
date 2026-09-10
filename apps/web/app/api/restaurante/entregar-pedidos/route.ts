import { entregarPedidos } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E6-6 · entrega todo lo que la cocina dejó listo. */
export const POST = manejadorDeComando(entregarPedidos);

export const runtime = 'nodejs';
