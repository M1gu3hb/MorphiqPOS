import 'server-only';

import {
  esErrorDominio,
  ESTADO_HTTP,
  validarEntorno,
  type Paquete,
  type Rol,
} from '@morphiqpos/contracts';
import { comando } from '@morphiqpos/app/produccion';
import { cuerpoDentroDelLimite, leerCookie, NOMBRE_COOKIE } from '@morphiqpos/app/http';
import { correlationIdDe, registrar } from '@morphiqpos/app/observabilidad';
import { resolverSesion, type SesionDeNegocio } from '@morphiqpos/app/sesion';
import { headers } from 'next/headers';

import { CABECERA_RUTA } from '../../middleware';
import type { ZodType } from 'zod';

import {
  peticionDeEscrituraValida,
  peticionMultipartValida,
  rolPermitidoParaConsulta,
} from './seguridad-http';

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

/**
 * La sesión para un COMPONENTE DE SERVIDOR, o `null` si no hay.
 *
 * ── Por qué devuelve null y no una Response ────────────────────────────
 * `sesionDeLaPeticion` devuelve la respuesta HTTP que corresponde, y eso es lo
 * correcto en una ruta: obliga a decidir qué hacer con ella. Un `layout.tsx` no
 * puede devolver una Response; lo que puede es pintar el marco sin los datos
 * que dependen de la sesión. Por eso aquí el «no hay sesión» es `null` y no un
 * 401: quien llama decide, y el caso normal —la pantalla de PIN, que se pinta
 * dentro del mismo marco— no tiene sesión y no es un error.
 *
 * NO autoriza nada. Autorizar es de las rutas.
 */
export async function sesionDelServidor(): Promise<SesionDeNegocio | null> {
  const cabeceras = await headers();
  const sesion = await sesionDeLaPeticion(cabeceras.get('cookie'));
  return sesion.ok ? sesion.sesion : null;
}

export async function ejecutarComandoHttp<E extends ZodType, S>(
  definicion: Parameters<typeof comando<E, S>>[0],
  peticion: Request,
): Promise<Response> {
  if (!peticionDeEscrituraValida(peticion, validarEntorno(process.env).APP_URL)) {
    return Response.json(errorHttp('SIN_PERMISO', 'Petición de escritura rechazada.'), {
      status: ESTADO_HTTP.SIN_PERMISO,
    });
  }
  if (!cuerpoDentroDelLimite(peticion.headers)) {
    return Response.json(errorHttp('CUERPO_DEMASIADO_GRANDE', 'El cuerpo supera 256 KiB.'), {
      status: 413,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const sesion = await sesionDeLaPeticion(peticion.headers.get('cookie'));
  if (!sesion.ok) return sesion.respuesta;

  const correlationId = correlationIdDe(
    peticion.headers.get('x-correlation-id') ?? peticion.headers.get('x-morphiqpos-correlacion'),
  );

  try {
    const entrada: unknown = await peticion.json();
    const idempotencyKey = peticion.headers.get('idempotency-key');
    const salida = await comando(definicion, {
      entrada,
      ambito: sesion.sesion,
      ...(idempotencyKey === null ? {} : { idempotencyKey }),
      correlationId,
    });
    return Response.json(salida, {
      status: salida.ok ? 200 : ESTADO_HTTP[salida.error.codigo],
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return responderError(error, {
      correlationId,
      organizacionId: sesion.sesion.organizacionId,
      ruta: rutaDe(peticion),
      peticion,
    });
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
  opciones: { readonly multipart?: boolean; readonly roles?: readonly Rol[] } = {},
): Promise<Response> {
  const appUrl = validarEntorno(process.env).APP_URL;
  const peticionValida =
    opciones.multipart === true
      ? peticionMultipartValida(peticion, appUrl)
      : peticionDeEscrituraValida(peticion, appUrl);
  if (!peticionValida) {
    return Response.json(errorHttp('SIN_PERMISO', 'Petición de lectura rechazada.'), {
      status: ESTADO_HTTP.SIN_PERMISO,
      headers: { 'cache-control': 'no-store' },
    });
  }
  if (opciones.multipart !== true && !cuerpoDentroDelLimite(peticion.headers)) {
    return Response.json(errorHttp('CUERPO_DEMASIADO_GRANDE', 'El cuerpo supera 256 KiB.'), {
      status: 413,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const sesion = await sesionDeLaPeticion(peticion.headers.get('cookie'));
  if (!sesion.ok) return sesion.respuesta;
  if (!rolPermitidoParaConsulta(sesion.sesion.rol, opciones.roles)) {
    return Response.json(errorHttp('SIN_PERMISO', 'Tu rol no permite subir archivos.'), {
      status: ESTADO_HTTP.SIN_PERMISO,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const correlationId = correlationIdDe(
    peticion.headers.get('x-correlation-id') ?? peticion.headers.get('x-morphiqpos-correlacion'),
  );

  try {
    const salida = await fn(sesion.sesion);
    if (salida instanceof Response) return salida;
    return Response.json({ ok: true, datos: salida }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return (
      respuestaDeDominio(error, correlationId) ??
      responderError(error, {
        correlationId,
        organizacionId: sesion.sesion.organizacionId,
        ruta: rutaDe(peticion),
        peticion,
      })
    );
  }
}

export function conSesionMultipart<T>(
  peticion: Request,
  roles: readonly Rol[],
  fn: (sesion: SesionDeNegocio) => Promise<T | Response>,
): Promise<Response> {
  return conSesion(peticion, fn, { multipart: true, roles });
}

/**
 * Un `ErrorDominio` del puente con su estado HTTP de verdad.
 *
 * Sin esto, pedir un campo que no existe devolvía 500 y el registro del
 * servidor se llenaba de «fallo no controlado» por un error del cliente. Un 500
 * dice «se rompió el servidor»; aquí lo que pasó es que la petición estaba mal,
 * y decirlo bien es lo que permite arreglarla.
 */
function respuestaDeDominio(error: unknown, correlationId: string): Response | null {
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
      correlationId,
    },
    { status: estado, headers: { 'cache-control': 'no-store' } },
  );
}

export interface OpcionesConsulta {
  readonly paquetes?: readonly Paquete[];
  readonly roles: readonly Rol[] | typeof PUBLICA;
}

/** Decisión explícita para una consulta que admite cualquier rol con sesión. */
export const PUBLICA = 'PUBLICA' as const;

export async function responderConsulta<T>(
  consulta: (sesion: SesionDeNegocio) => T | Promise<T>,
  opciones: OpcionesConsulta,
): Promise<Response> {
  // Las rutas GET de gestión no reciben el `Request`, así que la cookie se lee
  // del contexto de Next. `headers()` es asíncrono desde Next 15.
  const cabeceras = await headers();
  const sesion = await sesionDeLaPeticion(cabeceras.get('cookie'));
  if (!sesion.ok) return sesion.respuesta;
  const correlationId = correlationIdDe(
    cabeceras.get('x-correlation-id') ?? cabeceras.get('x-morphiqpos-correlacion'),
  );

  if (opciones.roles !== PUBLICA && !rolPermitidoParaConsulta(sesion.sesion.rol, opciones.roles)) {
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
    const salida = await consulta(sesion.sesion);
    if (salida instanceof Response) return salida;
    return Response.json(
      { ok: true, datos: salida },
      // Datos del negocio y de la sesión: no se cachean en ningún intermedio.
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return responderError(error, {
      correlationId,
      organizacionId: sesion.sesion.organizacionId,
      // Esta función NO recibe el `Request` —las rutas GET de gestión no se lo
      // pasan— así que la ruta sale de la cabecera que pone el middleware.
      ruta: cabeceras.get(CABECERA_RUTA) ?? '?',
    });
  }
}

/** La ruta de la petición, sin la cadena de consulta: puede llevar datos. */
function rutaDe(peticion: Request): string {
  try {
    return new URL(peticion.url).pathname;
  } catch {
    return '?';
  }
}

/**
 * Cómo se llama el fallo, sin llevarse nada de dentro.
 *
 * La clase del error y, si es de Postgres, su SQLSTATE: cinco caracteres del
 * estándar —`23503` clave foránea, `23514` check, `42501` permiso— que no
 * contienen valores de entrada ni nombres del esquema.
 *
 * Existe porque este registro decía «Fallo no controlado» y nada más: un 500 con
 * un correlationId y cero pistas. Pasó dos veces el mismo día —aquí y en
 * `comando()`— y las dos costó lo mismo: reproducir a mano para averiguar qué
 * había fallado. El mensaje original sigue sin salir, que es lo correcto: puede
 * llevar valores de la entrada.
 */
function claseDelFallo(error: unknown): string {
  const clase = error instanceof Error ? error.constructor.name : typeof error;
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null;
  // Y el prefijo `[Entidad]` que el puente pone en el mensaje, si está: es una
  // clave de su mapa —una de 82 constantes— y no un dato del negocio. Sin ella un
  // 500 en `/api/datos/consultar` no dice qué pantalla se rompió.
  const entidad =
    error instanceof Error ? (/^\[([A-Za-z]{1,40})\]/.exec(error.message)?.[1] ?? null) : null;
  const cola = entidad === null ? '' : ` entidad=${entidad}`;
  return (codigo === null ? `causa=${clase}` : `causa=${clase} sqlstate=${codigo}`) + cola;
}

/**
 * ¿Se fue el cliente antes de la respuesta?
 *
 * ── Por qué importa distinguirlo ───────────────────────────────────────────
 * Una corrida de navegador que abre trece pantallas seguidas deja diez
 * `ECONNRESET` en el registro, y ninguno es un defecto: cada pantalla aborta sus
 * consultas al desmontarse —`control.abort()` en su efecto— y el servidor acaba
 * escribiendo una respuesta en un socket que ya no está. Eso no es «fallo no
 * controlado»: es un usuario que cambió de pantalla.
 *
 * Y mezclarlos es peor que no registrar nada: con diez líneas de error que no son
 * errores, el registro deja de leerse, y el día que haya uno de verdad estará
 * entre ellas. Se registra como AVISO y con su nombre.
 */
function elClienteSeFue(peticion: Request | undefined): boolean {
  return peticion?.signal.aborted === true;
}

function responderError(
  error: unknown,
  contexto: {
    readonly correlationId: string;
    readonly organizacionId: string;
    /** La ruta que falló. Sin ella, un 500 no dice ni qué pantalla se rompió. */
    readonly ruta?: string;
    /** La petición, para saber si quien preguntaba sigue ahí. */
    readonly peticion?: Request;
  },
): Response {
  const seFue = elClienteSeFue(contexto.peticion);
  const donde = contexto.ruta === undefined ? '' : ` ruta=${contexto.ruta}`;
  registrar({
    nivel: seFue ? 'alerta' : 'error',
    modulo: 'api',
    correlationId: contexto.correlationId,
    organizacionId: contexto.organizacionId,
    mensaje: seFue
      ? `El cliente se fue antes de la respuesta.${donde}`
      : `Fallo no controlado.${donde} ${claseDelFallo(error)}`,
  });
  return Response.json(
    errorHttp('ERROR_INTERNO', 'No fue posible completar la operación.', contexto.correlationId),
    {
      status: ESTADO_HTTP.ERROR_INTERNO,
      headers: { 'x-correlation-id': contexto.correlationId },
    },
  );
}

function errorHttp(
  codigo:
    | 'SIN_PERMISO'
    | 'PAQUETE_NO_INCLUYE'
    | 'NO_AUTENTICADO'
    | 'CUERPO_DEMASIADO_GRANDE'
    | 'ERROR_INTERNO',
  mensaje: string,
  correlationId: string = crypto.randomUUID(),
) {
  return { ok: false, error: { codigo, mensaje }, correlationId } as const;
}
