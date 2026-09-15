import { sentarEspera } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(sentarEspera);

export const runtime = 'nodejs';
