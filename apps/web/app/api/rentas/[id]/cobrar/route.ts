import { cobrarRenta } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-441 · Cobrar la renta de la silla. El monto sale de la RENTA y no de la
 * entrada: aceptarlo de la pantalla lo volveria negociable por teclado.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar.
 */
export const POST = manejadorDeComandoConParametro(cobrarRenta, 'rentaId');

export const runtime = 'nodejs';
