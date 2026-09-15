import { cortarMaterial } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(cortarMaterial);

export const runtime = 'nodejs';
