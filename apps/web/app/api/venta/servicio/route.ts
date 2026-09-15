import { registrarServicio } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarServicio);

export const runtime = 'nodejs';
