import { miDia } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-426 · La pantalla 4.3.6, y no es la agenda filtrada.
 *
 * La agenda del salon la lee la recepcion para COLOCAR gente; esta la lee la
 * estilista entre clienta y clienta, de pie. Lleva quien sigue, a que hora, que
 * le toca y cuanto lleva ganado, y NO lleva el margen del servicio ni el costo
 * del material que absorbe el salon.
 */
export const POST = manejadorDeComandoConParametro(miDia, 'profesionalId');

export const runtime = 'nodejs';
