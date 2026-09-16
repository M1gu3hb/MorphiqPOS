import { agendarCita } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-400 · Agendar una cita. */
export const POST = manejadorDeComando(agendarCita);

export const runtime = 'nodejs';
