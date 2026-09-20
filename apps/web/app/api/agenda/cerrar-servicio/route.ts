import { cerrarServicio } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(cerrarServicio);

export const runtime = 'nodejs';
