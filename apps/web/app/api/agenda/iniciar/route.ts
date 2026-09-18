import { iniciarCita } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(iniciarCita);

export const runtime = 'nodejs';
