import { purgarVentas } from '@morphiqpos/app/mantenimiento';

import { ejecutarMantenimiento } from '~/servidor/mantenimiento';

/**
 * Borra todas las ventas. La clave de idempotencia impide que un reintento duplique el inventario.
 *
 * El rol sale de la SESIÓN, jamás del cuerpo. Un comando que aceptara
 * `{"rol":"administrador"}` no compila: `definirComando` lo rechaza al cargar
 * el módulo. Es lo que cierra el defecto D-03 de raíz.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarMantenimiento(purgarVentas, peticion);
}
