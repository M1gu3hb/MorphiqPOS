import { estadoDeCaja } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(estadoDeCaja);

export const runtime = 'nodejs';
