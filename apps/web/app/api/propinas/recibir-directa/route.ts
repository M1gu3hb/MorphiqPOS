import { recibirPropina } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-243 · La propina que es de QUIEN hizo el servicio, y no se reparte.
 */
export const POST = manejadorDeComando(recibirPropina);

export const runtime = 'nodejs';
