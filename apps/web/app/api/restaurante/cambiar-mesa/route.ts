import { cambiarMesaComando } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(cambiarMesaComando);

export const runtime = 'nodejs';
