import { registrarCompra } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarCompra);

export const runtime = 'nodejs';
