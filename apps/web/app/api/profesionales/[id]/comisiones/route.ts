import { comisionesDelProfesional } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-427 · La comision se lee ANTES de la liquidacion, no despues.
 *
 * La discusion de fin de quincena -«a mi me salian otros numeros»- se evita
 * dejandola mirar el acumulado todos los dias. Un salon que solo la ensena el
 * dia del pago tiene esa discusion cada quince dias, con la persona que le esta
 * atendiendo a las clientas.
 */
export const POST = manejadorDeComandoConParametro(comisionesDelProfesional, 'profesionalId');

export const runtime = 'nodejs';
