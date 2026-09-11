import { validarEntorno } from '@morphiqpos/contracts';
import { permitir } from '@morphiqpos/app/http';
import { desbloquearPresentacion } from '@morphiqpos/app/puente-presentacion';

import { ejecutarComandoHttp } from '~/servidor/http';

/**
 * Comprueba la contraseña del modo presentación EN EL SERVIDOR.
 *
 * La contraseña NO sale nunca de la base: `configuracion.ts` la tiene en
 * `NUNCA_SALEN`. Antes se comparaba en el navegador contra un valor que
 * viajaba en texto plano, con `'2797'` de reserva escrito en el código.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(peticion: Request): Promise<Response> {
  const entorno = validarEntorno(process.env);
  const permiso = await permitir('presentacion', peticion.headers, entorno.PIN_PEPPER);
  if (!permiso.ok) {
    return Response.json(
      {
        ok: false,
        error: {
          codigo: 'LIMITE_DE_TASA',
          mensaje: 'Demasiados intentos. Espera unos minutos antes de volver a probar.',
        },
      },
      { status: 429, headers: { 'cache-control': 'no-store' } },
    );
  }
  return ejecutarComandoHttp(desbloquearPresentacion, peticion);
}
