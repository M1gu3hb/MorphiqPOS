import { cobrarCita } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-430 · El cobro de la cita, con los precios congelados del servidor.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar:
 * así cada línea del registro de acceso señala a un registro concreto, y aun
 * así nada entra sin pasar por el mismo `zod` que todo lo demás.
 */
export const POST = manejadorDeComandoConParametro(cobrarCita, 'citaId');

export const runtime = 'nodejs';
