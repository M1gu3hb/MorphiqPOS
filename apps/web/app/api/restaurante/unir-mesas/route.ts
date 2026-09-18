import { unirMesasComando } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(unirMesasComando);

export const runtime = 'nodejs';
