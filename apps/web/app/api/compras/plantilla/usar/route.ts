import { usarPlantillaCompra } from '@morphiqpos/app/compras';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(usarPlantillaCompra);

export const runtime = 'nodejs';
