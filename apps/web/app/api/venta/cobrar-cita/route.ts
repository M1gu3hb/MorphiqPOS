import { cobrarCita } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(cobrarCita);

export const runtime = 'nodejs';
