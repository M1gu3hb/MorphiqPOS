import 'server-only';

import { NOMBRE_COOKIE, leerCookie, type DefinicionServible } from '@morphiqpos/app/http';
import { consultarSesionGestion, type SesionGestion } from '@morphiqpos/app/gestion';
import { resolverSesion } from '@morphiqpos/app/sesion';
import { ESTADO_HTTP, validarEntorno, type Paquete } from '@morphiqpos/contracts';
import type { ZodType } from 'zod';

import { peticionDeEscrituraValida } from './seguridad-http';
import { manejadorDeComando } from './ruta';

export async function ejecutarComandoHttp<E extends ZodType, S>(
  definicion: DefinicionServible<E, S>,
  peticion: Request,
): Promise<Response> {
  if (!peticionDeEscrituraValida(peticion)) {
    return Response.json(errorHttp('SIN_PERMISO', 'Petición de escritura rechazada.'), {
      status: ESTADO_HTTP.SIN_PERMISO,
    });
  }

  return manejadorDeComando(definicion)(peticion);
}

export async function responderConsulta<T>(
  peticion: Request,
  consulta: (sesion: SesionGestion) => T | Promise<T>,
  paquetes?: readonly Paquete[],
): Promise<Response> {
  try {
    const entorno = validarEntorno(process.env);
    const resultadoSesion = await resolverSesion({
      secreto: entorno.SESSION_SECRET,
      token: leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE),
    });
    if (!resultadoSesion.ok) return responderSesionFallida(resultadoSesion.motivo);
    const sesion = await consultarSesionGestion(resultadoSesion.ambito);
    if (paquetes !== undefined && !paquetes.includes(sesion.paquete)) {
      return Response.json(
        errorHttp('PAQUETE_NO_INCLUYE', 'El paquete activo no incluye esta función.'),
        {
          status: ESTADO_HTTP.PAQUETE_NO_INCLUYE,
        },
      );
    }
    return Response.json({ ok: true, datos: await consulta(sesion) });
  } catch (error) {
    return responderError(error);
  }
}

function responderError(error: unknown): Response {
  console.error('[api] fallo no controlado', error);
  return Response.json(errorHttp('ERROR_INTERNO', 'No fue posible completar la operación.'), {
    status: ESTADO_HTTP.ERROR_INTERNO,
  });
}

function responderSesionFallida(
  motivo: 'ausente' | 'invalida' | 'expirada' | 'revocada',
): Response {
  const revocada = motivo === 'revocada';
  return Response.json(
    errorHttp(
      revocada ? 'SIN_PERMISO' : 'NO_AUTENTICADO',
      revocada
        ? 'Tu acceso cambió. Pide a un encargado que lo revise.'
        : 'Inicia sesión para continuar.',
    ),
    { status: revocada ? ESTADO_HTTP.SIN_PERMISO : ESTADO_HTTP.NO_AUTENTICADO },
  );
}

function errorHttp(
  codigo: 'SIN_PERMISO' | 'PAQUETE_NO_INCLUYE' | 'NO_AUTENTICADO' | 'ERROR_INTERNO',
  mensaje: string,
) {
  return { ok: false, error: { codigo, mensaje }, correlationId: crypto.randomUUID() } as const;
}
