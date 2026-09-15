import { bajaAutorizado } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(bajaAutorizado);

export const runtime = 'nodejs';
