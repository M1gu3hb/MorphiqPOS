import { cancelarCita } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * F-412 · Cancelar una cita, con su motivo.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar:
 * así cada línea del registro de acceso señala a un registro concreto, y aun
 * así nada entra sin pasar por el mismo `zod` que todo lo demás.
 */
export const POST = manejadorDeComandoConParametro(cancelarCita, 'citaId');

export const runtime = 'nodejs';
