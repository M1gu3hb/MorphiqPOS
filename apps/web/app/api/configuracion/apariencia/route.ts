import { fijarApariencia } from '@morphiqpos/app/configuracion';

import { ejecutarComandoHttp } from '~/servidor/http';

/**
 * Fija el estilo visual del negocio y sus cuatro perillas.
 *
 * Sólo el DUEÑO: la apariencia es la marca del negocio, no una preferencia de quien
 * está en la caja. Si la cambiara un cajero, el siguiente turno encontraría otro
 * sistema.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(fijarApariencia, peticion);
}
