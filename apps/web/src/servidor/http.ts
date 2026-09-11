import 'server-only';

import {
  esErrorDominio,
  ESTADO_HTTP,
  validarEntorno,
  type Paquete,
  type Rol,
} from '@morphiqpos/contracts';
import { comando } from '@morphiqpos/app/produccion';
import { leerCookie, NOMBRE_COOKIE } from '@morphiqpos/app/http';
import { resolverSesion, type SesionDeNegocio } from '@morphiqpos/app/sesion';
import { headers } from 'next/headers';
import type { ZodType } from 'zod';

import { peticionDeEscrituraValida, rolPermitidoParaConsulta } from './seguridad-http';

/**
 * Las rutas de gestión, atadas a la sesión REAL (F1.1-C-05).
 *
 * Antes esto colgaba de `resolverAmbitoDesarrollo`, un adaptador que buscaba
 * «el primer dueño de la organización demo» y **lanzaba en producción**. Es
 * decir: las siete pantallas de gestión estaban muertas en el sitio publicado y
 * en local le daban a cualquier visitante el ámbito del dueño. No era un atajo
 * pequeño; era la autorización entera.
 *
 * Ahora el ámbito sale de la cookie firmada, se releé de la base en cada
 * petición y una baja lo revoca en la siguiente. Igual que en venta: **un solo
 * sitio donde nace un ámbito.**
 */

export type { SesionDeNegocio };

/**
 * Resuelve la sesión o devuelve la respuesta HTTP que corresponde.
 *
 * Devolver la respuesta en vez de lanzar obliga a quien llama a decidir qué
 * hacer con ella, y hace imposible olvidarse: el tipo no deja seguir.
 */
async function sesionDeLaPeticion(
  cookie: string | null,
): Promise<{ ok: true; sesion: SesionDeNegocio } | { ok: false; respuesta: Response }> {
  const entorno = validarEntorno(process.env);
  const resultado = await resolverSesion({
    secreto: entorno.SESSION_SECRET,
    token: leerCookie(cookie, NOMBRE_COOKIE),
  });

  if (resultado.ok) return { ok: true, sesion: resultado.sesion };

  // `revocada` es 403 y no 401: la sesión era válida y dejó de serlo. Volver a
  // pedir el PIN no arregla que te hayan dado de baja.
  const revocada = resultado.motivo === 'revocada';
  return {
    ok: false,
    respuesta: Response.json(
      errorHttp(
        revocada ? 'SIN_PERMISO' : 'NO_AUTENTICADO',
        revocada
          ? 'Tu acceso cambió. Pide a un encargado que lo revise.'
          : 'Inicia sesión para continuar.',
      ),
      { status: revocada ? ESTADO_HTTP.SIN_PERMISO : ESTADO_HTTP.NO_AUTENTICADO },
    ),
  };
}

export async function ejecutarComandoHttp<E extends ZodType, S>(
  definicion: Parameters<typeof comando<E, S>>[0],
  peticion: Request,
): Promise<Response> {
  if (!peticionDeEscrituraValida(peticion)) {
    return Response.json(errorHttp('SIN_PERMISO', 'Petición de escritura rechazada.'), {
      status: ESTADO_HTTP.SIN_PERMISO,
    });
  }

  const sesion = await sesionDeLaPeticion(peticion.headers.get('cookie'));
  if (!sesion.ok) return sesion.respuesta;

  try {
    const entrada: unknown = await peticion.json();
    const idempotencyKey = peticion.headers.get('idempotency-key');
    const correlationId = peticion.headers.get('x-correlation-id');
    const salida = await comando(definicion, {
      entrada,
      ambito: sesion.sesion,
      ...(idempotencyKey === null ? {} : { idempotencyKey }),
      ...(correlationId === null ? {} : { correlationId }),
    });
    return Response.json(salida, {
      status: salida.ok ? 200 : ESTADO_HTTP[salida.error.codigo],
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return responderError(error);
  }
}

/**
 * Una LECTURA por POST, con la sesión ya resuelta (E3-4).
 *
 * `responderConsulta` lee la cookie del contexto de Next porque las rutas GET
 * no reciben el `Request`. El puente sí lo recibe —es un POST con cuerpo—, así
 * que la lee de ahí y de paso evita el `headers()` asíncrono por petición.
 *
 * El callback puede devolver los datos, o una `Response` ya armada cuando
 * necesita un código distinto de 200. Devolver la respuesta en vez de lanzar
 * obliga a quien llama a decidir qué hacer con ella.
 */
export async function conSesion<T>(
  peticion: Request,
  fn: (sesion: SesionDeNegocio) => Promise<T | Response>,
): Promise<Response> {
  const sesion = await sesionDeLaPeticion(peticion.headers.get('cookie'));
  if (!sesion.ok) return sesion.respuesta;

  try {
    const salida = await fn(sesion.sesion);
    if (salida instanceof Response) return salida;
    return Response.json({ ok: true, datos: salida }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return respuestaDeDominio(error) ?? responderError(error);
  }
}

/**
 * Un `ErrorDominio` del puente con su estado HTTP de verdad.
 *
 * Sin esto, pedir un campo que no existe devolvía 500 y el registro del
 * servidor se llenaba de «fallo no controlado» por un error del cliente. Un 500
 * dice «se rompió el servidor»; aquí lo que pasó es que la petición estaba mal,
 * y decirlo bien es lo que permite arreglarla.
 */
function respuestaDeDominio(error: unknown): Response | null {
  if (!esErrorDominio(error)) return null;
  const estados: Readonly<Record<string, number>> = {
    PUENTE_ENTIDAD_DESCONOCIDA: 400,
    PUENTE_CAMPO_INVALIDO: 400,
    PUENTE_SIN_PERMISO: 403,
    PUENTE_NO_ENCONTRADO: 404,
  };
  const estado = estados[error.codigo] ?? 422;
  return Response.json(
    {
      ok: false,
      error: { codigo: error.codigo, mensaje: error.message },
      correlationId: crypto.randomUUID(),
    },
    { status: estado, headers: { 'cache-control': 'no-store' } },
  );
}

export interface OpcionesConsulta {
  readonly paquetes?: readonly Paquete[];
  readonly roles?: readonly Rol[];
}

export async function responderConsulta<T>(
  consulta: (sesion: SesionDeNegocio) => T | Promise<T>,
  opciones: OpcionesConsulta = {},
): Promise<Response> {
  // Las rutas GET de gestión no reciben el `Request`, así que la cookie se lee
  // del contexto de Next. `headers()` es asíncrono desde Next 15.
  const sesion = await sesionDeLaPeticion((await headers()).get('cookie'));
  if (!sesion.ok) return sesion.respuesta;

  if (!rolPermitidoParaConsulta(sesion.sesion.rol, opciones.roles)) {
    return Response.json(errorHttp('SIN_PERMISO', 'Tu rol no permite consultar este recurso.'), {
      status: ESTADO_HTTP.SIN_PERMISO,
      headers: { 'cache-control': 'no-store' },
    });
  }

  if (opciones.paquetes !== undefined && !opciones.paquetes.includes(sesion.sesion.paquete)) {
    return Response.json(
      errorHttp('PAQUETE_NO_INCLUYE', 'El paquete activo no incluye esta función.'),
      { status: ESTADO_HTTP.PAQUETE_NO_INCLUYE },
    );
  }

  try {
    return Response.json(
      { ok: true, datos: await consulta(sesion.sesion) },
      // Datos del negocio y de la sesión: no se cachean en ningún intermedio.
      { headers: { 'cache-control': 'no-store' } },
    );
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

function errorHttp(
  codigo: 'SIN_PERMISO' | 'PAQUETE_NO_INCLUYE' | 'NO_AUTENTICADO' | 'ERROR_INTERNO',
  mensaje: string,
) {
  return { ok: false, error: { codigo, mensaje }, correlationId: crypto.randomUUID() } as const;
}
