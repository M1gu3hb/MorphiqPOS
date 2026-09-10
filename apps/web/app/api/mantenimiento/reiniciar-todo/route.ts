import { reiniciarTodo } from '@morphiqpos/app/mantenimiento';

import { ejecutarMantenimiento } from '~/servidor/mantenimiento';

/**
 * Borra histórico Y catálogo. NO crea ningún usuario con PIN por omisión.
 *
 * El rol sale de la SESIÓN, jamás del cuerpo. Un comando que aceptara
 * `{"rol":"administrador"}` no compila: `definirComando` lo rechaza al cargar
 * el módulo. Es lo que cierra el defecto D-03 de raíz.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarMantenimiento(reiniciarTodo, peticion);
}
