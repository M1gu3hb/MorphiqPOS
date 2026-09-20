import { ajustarPresencia } from '@morphiqpos/app/cafeteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(ajustarPresencia);

export const runtime = 'nodejs';
