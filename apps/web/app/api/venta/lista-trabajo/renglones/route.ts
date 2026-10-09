import { renglonesDeLista } from '@morphiqpos/app/ferreteria';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-153 · Los renglones de una lista, tal cual los dictó el albañil, con lo ya
 * traducido y lo ya entregado.
 */
export const POST = manejadorDeComando(renglonesDeLista);

export const runtime = 'nodejs';
