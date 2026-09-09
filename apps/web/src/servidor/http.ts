import 'server-only';

import { ESTADO_HTTP, type Paquete } from '@morphiqpos/contracts';
import { comando } from '@morphiqpos/app/produccion';
import {
  ErrorNoAutenticado,
  resolverAmbitoDesarrollo,
  type SesionServidor,
} from '@morphiqpos/app/puente-desarrollo';
import type { ZodType } from 'zod';

import { peticionDeEscrituraValida } from './seguridad-http';

export async function ejecutarComandoHttp<E extends ZodType, S>(
  definicion: Parameters<typeof comando<E, S>>[0],
  peticion: Request,
): Promise<Response> {
  if (!peticionDeEscrituraValida(peticion)) {
    return Response.json(errorHttp('SIN_PERMISO', 'Petición de escritura rechazada.'), {
      status: ESTADO_HTTP.SIN_PERMISO,
    });
  }

  try {
    const entrada: unknown = await peticion.json();
    const ambito = await resolverAmbitoDesarrollo();
    const idempotencyKey = peticion.headers.get('idempotency-key');
    const correlationId = peticion.headers.get('x-correlation-id');
    const salida = await comando(definicion, {
      entrada,
      ambito,
      ...(idempotencyKey === null ? {} : { idempotencyKey }),
      ...(correlationId === null ? {} : { correlationId }),
    });
    return Response.json(salida, {
      status: salida.ok ? 200 : ESTADO_HTTP[salida.error.codigo],
    });
  } catch (error) {
    return responderError(error);
  }
}

export async function responderConsulta<T>(
  consulta: (sesion: SesionServidor) => T | Promise<T>,
  paquetes?: readonly Paquete[],
): Promise<Response> {
  try {
    const sesion = await resolverAmbitoDesarrollo();
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
  if (error instanceof ErrorNoAutenticado) {
    return Response.json(errorHttp('NO_AUTENTICADO', 'Inicia sesión para continuar.'), {
      status: ESTADO_HTTP.NO_AUTENTICADO,
    });
  }
  console.error('[api] fallo no controlado', error);
  return Response.json(errorHttp('ERROR_INTERNO', 'No fue posible completar la operación.'), {
    status: ESTADO_HTTP.ERROR_INTERNO,
  });
}

function errorHttp(
  codigo: 'SIN_PERMISO' | 'PAQUETE_NO_INCLUYE' | 'NO_AUTENTICADO' | 'ERROR_INTERNO',
  mensaje: string,
) {
  return { ok: false, error: { codigo, mensaje }, correlationId: crypto.randomUUID() } as const;
}
