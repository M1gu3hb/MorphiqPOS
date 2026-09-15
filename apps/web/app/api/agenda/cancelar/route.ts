import { cancelarCita } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(cancelarCita);

export const runtime = 'nodejs';
