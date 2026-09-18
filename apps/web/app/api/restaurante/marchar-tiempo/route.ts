import { marcharTiempo } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(marcharTiempo);

export const runtime = 'nodejs';
