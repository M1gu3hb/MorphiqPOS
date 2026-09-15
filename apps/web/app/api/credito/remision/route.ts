import { registrarRemision } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarRemision);

export const runtime = 'nodejs';
