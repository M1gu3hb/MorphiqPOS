import { deshacerEntrega } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(deshacerEntrega);

export const runtime = 'nodejs';
