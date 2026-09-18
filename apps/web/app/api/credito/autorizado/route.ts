import { altaAutorizado } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(altaAutorizado);

export const runtime = 'nodejs';
