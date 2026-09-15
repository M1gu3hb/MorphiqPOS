import { buscarMaterial } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(buscarMaterial);

export const runtime = 'nodejs';
