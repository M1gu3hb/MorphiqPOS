import { registrarConsumoInterno } from '@morphiqpos/app/inventario';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarConsumoInterno);

export const runtime = 'nodejs';
