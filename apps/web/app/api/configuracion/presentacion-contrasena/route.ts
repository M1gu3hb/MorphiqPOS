import { fijarContrasenaPresentacion } from '@morphiqpos/app/puente-presentacion';

import { ejecutarComandoHttp } from '~/servidor/http';

/**
 * Fija la contraseña del modo presentación. Sólo el dueño.
 *
 * La contraseña NO sale nunca de la base: `configuracion.ts` la tiene en
 * `NUNCA_SALEN`. Antes se comparaba en el navegador contra un valor que
 * viajaba en texto plano, con `'2797'` de reserva escrito en el código.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(peticion: Request): Promise<Response> {
  return ejecutarComandoHttp(fijarContrasenaPresentacion, peticion);
}
