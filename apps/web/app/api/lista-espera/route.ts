import { anotarEnEspera } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-409 · Anotar a alguien en la espera, con una VENTANA y no con una hora:
 * nadie dice «el sábado a las 11:00».
 */
export const POST = manejadorDeComando(anotarEnEspera);

export const runtime = 'nodejs';
