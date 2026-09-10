import { registrarGasto } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarGasto);

export const runtime = 'nodejs';
