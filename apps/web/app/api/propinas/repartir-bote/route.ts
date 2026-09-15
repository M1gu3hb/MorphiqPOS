import { repartirBote } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(repartirBote);

export const runtime = 'nodejs';
