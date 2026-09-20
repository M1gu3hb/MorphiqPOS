import { aplicarAnticipo } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-414 · Aplicar el anticipo al cobro. Exige la orden: un anticipo aplicado
 * sin decir a qué cuenta es dinero que sale del pasivo sin entrar a ninguna
 * venta, y al cuadrar el mes no hay de dónde tirar del hilo.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar.
 */
export const POST = manejadorDeComandoConParametro(aplicarAnticipo, 'anticipoId');

export const runtime = 'nodejs';
