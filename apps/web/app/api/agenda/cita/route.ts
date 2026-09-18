import { agendarCita } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(agendarCita);

export const runtime = 'nodejs';
