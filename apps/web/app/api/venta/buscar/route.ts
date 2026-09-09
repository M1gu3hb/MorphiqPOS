import { buscarCatalogo } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(buscarCatalogo);

export const runtime = 'nodejs';
