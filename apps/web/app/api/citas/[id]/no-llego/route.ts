import { marcarNoLlego } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-434 · El no-show, que se MARCA y no se deduce del reloj, y queda firmado.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar:
 * así cada línea del registro de acceso señala a un registro concreto, y aun
 * así nada entra sin pasar por el mismo `zod` que todo lo demás.
 */
export const POST = manejadorDeComandoConParametro(marcarNoLlego, 'citaId');

export const runtime = 'nodejs';
