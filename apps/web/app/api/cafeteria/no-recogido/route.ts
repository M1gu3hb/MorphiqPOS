import { marcarNoRecogido } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(marcarNoRecogido);

export const runtime = 'nodejs';
