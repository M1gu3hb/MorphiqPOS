import { abrirExpediente } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-153 · El expediente se ABRE en cada visita, antes de tocar a la clienta, y
 * se llena con guantes puestos. No es «notas del cliente».
 *
 * Un solo comando lee y escribe: separarlo obligaria a la pantalla a encadenar
 * dos peticiones con la clienta sentada delante, y a decidir que hacer si la
 * segunda falla. Y solo se toca LO QUE VIENE: mandar el formulario entero desde
 * la pantalla que solo queria corregir las canas borraria las alergias.
 */
export const POST = manejadorDeComandoConParametro(abrirExpediente, 'clienteId');

export const runtime = 'nodejs';
