import 'server-only';

import { ESTADO_HTTP, esErrorDominio, validarEntorno, type Resultado } from '@morphiqpos/contracts';
import type { ZodType } from 'zod';

import { negocioDelDespliegue } from '../negocio/despliegue.ts';
import { cuerpoDentroDelLimite } from '../http/limite-cuerpo.ts';
import { ejecutarComandoPublico } from './comando-publico.ts';
import type { ComandoPublico } from './definicion-publica.ts';
import { payloadDelPortal, type PayloadPortal } from './consulta.ts';

/**
 * La capa HTTP del portal público (E7-1, E7-3).
 *
 * Vive en `packages/app` y no en `apps/web` por lo mismo que `http/ruta.ts`:
 * necesita `packages/data` para resolver el negocio, y `apps/web` no puede
 * importar `data` (prohibición 1 de `04-ARQUITECTURA §2`, verificada por lint).
 * Las rutas de Next quedan en tres líneas y sin nada que se pueda olvidar.
 *
 * ── La organización NO viene de la URL ────────────────────────────────────
 * Sale de `negocioDelDespliegue`, igual que en la pantalla de acceso. El token
 * dice QUÉ MESA; el despliegue dice DE QUÉ NEGOCIO. Si la organización llegara
 * en la petición, el token de una mesa serviría para leer el menú de otra.
 */

/** Lo mínimo de una petición HTTP. `Request` de la Web API ya lo cumple. */
export interface PeticionDelPortal {
  readonly method: string;
  readonly url: string;
  readonly headers: { get(nombre: string): string | null };
  json(): Promise<unknown>;
}

export interface RespuestaDelPortal {
  readonly estado: number;
  readonly cuerpo: unknown;
  readonly cabeceras: Readonly<Record<string, string>>;
}

/**
 * Estado HTTP de cada regla del portal.
 *
 * `REGLA_DE_NEGOCIO` es 422 para todo, y aquí eso perdería información que el
 * portal necesita: un 429 le dice a la pantalla que espere, y un 409 que su
 * aviso ya estaba puesto. El token inválido es 404 —no existe, sin decir por
 * qué— y el portal apagado 403.
 */
const ESTADO_POR_REGLA: Readonly<Record<string, number>> = {
  QR_TOKEN_INVALIDO: 404,
  QR_PORTAL_CERRADO: 403,
  QR_SOLICITUD_DUPLICADA: 409,
  QR_DEMASIADAS_PETICIONES: 429,
};

function estadoDe(salida: Resultado<unknown>): number {
  if (salida.ok) return 200;
  const regla = salida.error.datos?.['regla'];
  if (typeof regla === 'string' && regla in ESTADO_POR_REGLA) {
    return ESTADO_POR_REGLA[regla] ?? ESTADO_HTTP[salida.error.codigo];
  }
  return ESTADO_HTTP[salida.error.codigo];
}

function respuesta(estado: number, cuerpo: unknown, correlationId?: string): RespuestaDelPortal {
  return {
    estado,
    cuerpo,
    cabeceras: {
      // El menú de una mesa lleva el estado de SU cuenta. Que un intermediario
      // lo guarde significaría servirle la cuenta de una mesa a otra.
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...(correlationId === undefined ? {} : { 'x-correlation-id': correlationId }),
    },
  };
}

function errorHttp(estado: number, codigo: string, mensaje: string): RespuestaDelPortal {
  return respuesta(estado, { ok: false, error: { codigo, mensaje } });
}

/**
 * Origen propio y cabecera de la aplicación, igual que las rutas con sesión.
 *
 * Se repite en vez de importarse porque el original vive en `apps/web/src` y
 * `packages/app` no puede depender de la aplicación: la dependencia va en el
 * otro sentido. Su sitio natural es `packages/app/src/http/`, que no es mío;
 * queda anotado en el informe.
 *
 * Aquí no hay cookie que robar, así que esto no es CSRF en sentido estricto:
 * es lo que impide que un formulario de otra página llene la cocina de pedidos
 * en nombre de una mesa cuyo código alguien fotografió.
 */
function peticionPropia(peticion: PeticionDelPortal): boolean {
  const tipo = peticion.headers.get('content-type') ?? '';
  if (!tipo.toLocaleLowerCase('en-US').startsWith('application/json')) return false;
  if (peticion.headers.get('x-morphiqpos-request') !== '1') return false;

  const origen = peticion.headers.get('origin');
  const esperado = new URL(validarEntorno(process.env).APP_URL).origin;
  return origen === null || origen === esperado;
}

interface Despliegue {
  readonly organizacionId: string;
  readonly pimienta: string;
}

async function resolverDespliegue(): Promise<Despliegue> {
  const entorno = validarEntorno(process.env);
  const negocio = await negocioDelDespliegue(entorno.ORGANIZACION);
  return { organizacionId: negocio.organizacionId, pimienta: entorno.PIN_PEPPER };
}

/** `GET /api/publico/qr/:token`. */
export async function servirPortal(token: string): Promise<RespuestaDelPortal> {
  try {
    const { organizacionId, pimienta } = await resolverDespliegue();
    const datos: PayloadPortal = await payloadDelPortal(organizacionId, token, pimienta);
    return respuesta(200, { ok: true, datos });
  } catch (error) {
    return respuestaDeError(error, 'publico.qr');
  }
}

/** Convierte un comando público en un manejador de ruta. Sólo acepta POST. */
export function manejadorPublico<E extends ZodType, S>(definicion: ComandoPublico<E, S>) {
  return async function manejar(
    token: string,
    peticion: PeticionDelPortal,
  ): Promise<RespuestaDelPortal> {
    if (peticion.method !== 'POST') {
      return errorHttp(405, 'METODO', 'Usa POST.');
    }
    if (!peticionPropia(peticion)) {
      return errorHttp(403, 'SIN_PERMISO', 'Petición de escritura rechazada.');
    }
    if (!cuerpoDentroDelLimite(peticion.headers)) {
      return errorHttp(413, 'CUERPO_DEMASIADO_GRANDE', 'El cuerpo supera 256 KiB.');
    }

    let entrada: unknown;
    try {
      entrada = await peticion.json();
    } catch {
      return errorHttp(400, 'ENTRADA_INVALIDA', 'El cuerpo de la petición no es JSON.');
    }

    let despliegue: Despliegue;
    try {
      despliegue = await resolverDespliegue();
    } catch (error) {
      return respuestaDeError(error, definicion.nombre);
    }

    const clave = peticion.headers.get('idempotency-key');
    const correlacion =
      peticion.headers.get('x-correlation-id') ?? peticion.headers.get('x-morphiqpos-correlacion');

    const salida = await ejecutarComandoPublico(definicion, {
      token,
      organizacionId: despliegue.organizacionId,
      pimienta: despliegue.pimienta,
      entrada,
      ...(clave === null ? {} : { idempotencyKey: clave }),
      ...(correlacion === null ? {} : { correlationId: correlacion }),
    });

    return respuesta(estadoDe(salida), salida, salida.correlationId);
  };
}

/**
 * Traduce lo que se escapa fuera del envoltorio.
 *
 * Sólo el GET y la resolución del despliegue llegan aquí: los comandos ya
 * devuelven su unión. Un `ErrorDominio` conserva su código y su mensaje —están
 * escritos para el comensal—; cualquier otra cosa se queda en el servidor.
 */
function respuestaDeError(error: unknown, donde: string): RespuestaDelPortal {
  if (esErrorDominio(error)) {
    const estado = ESTADO_POR_REGLA[error.codigo] ?? ESTADO_HTTP.REGLA_DE_NEGOCIO;
    return respuesta(estado, {
      ok: false,
      error: { codigo: 'REGLA_DE_NEGOCIO', mensaje: error.message, datos: { regla: error.codigo } },
    });
  }

  console.error(`[portal] ${donde} falló:`, error);
  return errorHttp(
    ESTADO_HTTP.ERROR_INTERNO,
    'ERROR_INTERNO',
    'No fue posible completar la operación.',
  );
}
