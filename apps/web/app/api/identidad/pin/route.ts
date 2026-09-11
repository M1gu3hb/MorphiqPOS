import { establecerPin } from '@morphiqpos/app/identidad';

import { ejecutarComandoHttp } from '~/servidor/http';

/**
 * Poner o cambiar el PIN de un empleado (F1.1-C-05).
 *
 * Va por `ejecutarComandoHttp` y no por `manejadorDeComando` porque las rutas
 * de gestión llevan además la validación de origen de escritura. El rol lo
 * comprueba el comando: sólo dueño y administrador.
 */
export const POST = (peticion: Request): Promise<Response> =>
  ejecutarComandoHttp(establecerPin, peticion);

export const runtime = 'nodejs';
