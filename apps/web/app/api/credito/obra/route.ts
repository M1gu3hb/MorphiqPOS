import { crearObra } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(crearObra);

export const runtime = 'nodejs';
