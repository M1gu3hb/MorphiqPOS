import { anotarCita } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(anotarCita);

export const runtime = 'nodejs';
