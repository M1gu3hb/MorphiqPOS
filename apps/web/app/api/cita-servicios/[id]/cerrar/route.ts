import { cerrarServicio } from '@morphiqpos/app/salon';

import { manejadorDeComandoConParametro } from '~/servidor/ruta';

/**
 * Cerrar el servicio —«ya terminé»— es lo que dispara el consumo de cabina.
 * No es cobrar: eso pasa en el mostrador, a veces media hora después.
 *
 * El identificador viaja EN LA RUTA y se mete en el cuerpo antes de validar:
 * así cada línea del registro de acceso señala a un registro concreto, y aun
 * así nada entra sin pasar por el mismo `zod` que todo lo demás.
 */
export const POST = manejadorDeComandoConParametro(cerrarServicio, 'citaServicioId');

export const runtime = 'nodejs';
