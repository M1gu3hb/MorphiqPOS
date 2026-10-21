import { traerCaja } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(traerCaja);

export const runtime = 'nodejs';
