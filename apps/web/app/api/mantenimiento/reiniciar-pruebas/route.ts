import { reiniciarPruebas } from '@morphiqpos/app/mantenimiento';

import { ejecutarMantenimiento } from '~/servidor/mantenimiento';

/**
 * Borra el histórico entero y deja el catálogo intacto.
 *
 * El rol sale de la SESIÓN, jamás del cuerpo. Un comando que aceptara
 * `{"rol":"administrador"}` no compila: `definirComando` lo rechaza al cargar
 * el módulo. Es lo que cierra el defecto D-03 de raíz.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarMantenimiento(reiniciarPruebas, peticion);
}
