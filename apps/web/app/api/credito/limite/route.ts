import { fijarMuroDeCredito } from '@morphiqpos/app/cartera';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-617 · Poner o quitar el muro por mora.
 *
 * SIEMPRE hay llave y siempre es del dueño: un bloqueo sin forma de levantarlo
 * deja a un cliente bueno parado en el mostrador por una factura que ya pagó y
 * que nadie capturó.
 */
export const POST = manejadorDeComando(fijarMuroDeCredito);

export const runtime = 'nodejs';
