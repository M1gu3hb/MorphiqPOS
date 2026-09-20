import { marcarNoLlego } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(marcarNoLlego);

export const runtime = 'nodejs';
