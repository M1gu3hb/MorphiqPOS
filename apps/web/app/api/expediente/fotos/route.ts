import { fotosDeClienta } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(fotosDeClienta);

export const runtime = 'nodejs';
