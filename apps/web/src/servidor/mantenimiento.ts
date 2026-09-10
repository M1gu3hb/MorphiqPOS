import { validarEntorno } from '@morphiqpos/contracts';
import { permitir } from '@morphiqpos/app/http';
import type { ZodType } from 'zod';

import { ejecutarComandoHttp } from './http';

/**
 * El envoltorio de las rutas de mantenimiento destructivo (E10-4).
 *
 * Hace UNA cosa además de `ejecutarComandoHttp`: aplicar el límite de tasa.
 *
 * Tres por hora y por origen. Nadie borra el histórico de su negocio cuatro
 * veces en una hora, y estos son exactamente los endpoints a los que iría una
 * sesión robada: quien la consigue no quiere leer, quiere destruir.
 *
 * El límite va ANTES del comando —y por tanto antes de la transacción— para que
 * un barrido no abra tres mil transacciones antes de que alguien lo note.
 *
 * `comando()` ya audita también los RECHAZOS, así que por primera vez habrá una
 * fila que diga quién intentó borrar el negocio y no pudo.
 */
export async function ejecutarMantenimiento<E extends ZodType, S>(
  definicion: Parameters<typeof ejecutarComandoHttp<E, S>>[0],
  peticion: Request,
): Promise<Response> {
  const entorno = validarEntorno(process.env);
  const permiso = await permitir('mantenimiento', peticion.headers, entorno.PIN_PEPPER);
  if (!permiso.ok) {
    return Response.json(
      {
        ok: false,
        error: {
          codigo: 'DEMASIADOS_INTENTOS',
          mensaje: `Demasiadas operaciones de mantenimiento. Vuelve a intentarlo en ${String(
            Math.ceil(permiso.esperaSegundos / 60),
          )} minutos.`,
        },
      },
      { status: 429, headers: { 'cache-control': 'no-store' } },
    );
  }
  return ejecutarComandoHttp(definicion, peticion);
}
