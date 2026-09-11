import { purgarSeccionDelHistorico } from '@morphiqpos/app/mantenimiento';

import { ejecutarMantenimiento } from '~/servidor/mantenimiento';

/**
 * Borra UNA sección del histórico. Exige el nombre del negocio.
 *
 * El rol sale de la SESIÓN, jamás del cuerpo. Un comando que aceptara
 * `{"rol":"administrador"}` no compila: `definirComando` lo rechaza al cargar
 * el módulo. Es lo que cierra el defecto D-03 de raíz.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarMantenimiento(purgarSeccionDelHistorico, peticion);
}
