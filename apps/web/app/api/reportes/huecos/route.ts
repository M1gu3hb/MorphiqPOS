import { reporteDeHuecos } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-417 · Cuanta capacidad se quedo sin vender, en pesos, por dia y por persona.
 *
 * Al ticket medio de ESA persona y no al del salon: el hueco de quien hace
 * tintes vale el triple que el de quien hace cortes, y promediarlos esconde
 * justo donde duele. Un salon que no lo mide contrata por la sensacion de
 * estar lleno.
 */
export const POST = manejadorDeComando(reporteDeHuecos);

export const runtime = 'nodejs';
