import { evaluarSalida } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(evaluarSalida);

export const runtime = 'nodejs';
