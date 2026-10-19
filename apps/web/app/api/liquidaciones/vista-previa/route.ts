import { vistaPreviaDeLiquidacion } from '@morphiqpos/app/salon';

import { manejadorDeComando } from '~/servidor/ruta';

/** F-427 · Lo que se le va a pagar a la profesional, ANTES de pagarlo: no escribe nada. */
export const POST = manejadorDeComando(vistaPreviaDeLiquidacion);

export const runtime = 'nodejs';
