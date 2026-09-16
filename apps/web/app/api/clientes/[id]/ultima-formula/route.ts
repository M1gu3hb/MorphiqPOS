import { ultimaFormula } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-154 · Lo que llena el boton REPETIR.
 *
 * Devuelve la formula CONGELADA -marca, tono, volumen, gramos, minutos- con los
 * dias que han pasado desde entonces: «este tono hace cinco semanas» y «este
 * tono hace ocho meses» no se repiten igual, y quien esta mezclando no tiene
 * tiempo de restar fechas.
 */
export const POST = manejadorDeComandoConParametro(ultimaFormula, 'clienteId');

export const runtime = 'nodejs';
