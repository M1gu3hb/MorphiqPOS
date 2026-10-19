import { guardarServicio } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(guardarServicio);

export const runtime = 'nodejs';
