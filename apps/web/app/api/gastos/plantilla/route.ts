import { guardarPlantillaGasto } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(guardarPlantillaGasto);

export const runtime = 'nodejs';
