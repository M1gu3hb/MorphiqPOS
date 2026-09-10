import { guardarPlantillaCompra } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(guardarPlantillaCompra);

export const runtime = 'nodejs';
