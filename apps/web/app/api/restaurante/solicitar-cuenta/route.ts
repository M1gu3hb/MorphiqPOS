import { solicitarCuenta } from '@morphiqpos/app/restaurante';

import { manejadorDeComando } from '~/servidor/ruta';

/** E6-8 · precuenta calculada en el servidor. */
export const POST = manejadorDeComando(solicitarCuenta);

export const runtime = 'nodejs';
