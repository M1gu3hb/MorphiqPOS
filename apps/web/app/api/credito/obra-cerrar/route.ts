import { cerrarObra } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(cerrarObra);

export const runtime = 'nodejs';
