import { ventasEnEspera } from '@morphiqpos/app/venta';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * Lo apartado en ESTA caja, con su código, su nota y los minutos que lleva (F-224). El
 * comando existía sin ruta: ninguna pantalla podía decir qué había apartado.
 */
export const POST = manejadorDeComando(ventasEnEspera);

export const runtime = 'nodejs';
