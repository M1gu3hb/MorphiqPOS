import { rotacionDeMesas } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(rotacionDeMesas);

export const runtime = 'nodejs';
