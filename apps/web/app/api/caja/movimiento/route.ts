import { registrarMovimientoCaja } from '@morphiqpos/app/caja';

import { manejadorDeComando } from '~/servidor/ruta';

export const POST = manejadorDeComando(registrarMovimientoCaja);

export const runtime = 'nodejs';
