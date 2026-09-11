import 'server-only';

import { ESTADO_HTTP, type Resultado } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import type { ZodType } from 'zod';

import { comando } from '../produccion.ts';
import type { DefinicionComando } from '../definicion.ts';
import { resolverSesion, type ResultadoSesion } from '../sesion/resolver.ts';

/**
 * El patrón de ruta de API (F1.1-X-01).
 *
 * Una ruta de comando siempre hace lo mismo: leer el cuerpo, resolver el ámbito
 * de la sesión, invocar el comando y traducir el resultado a HTTP. Escribirlo
 * treinta veces garantiza que la treinta y uno se le olvide a alguien resolver
 * el ámbito y acepte `organizacion_id` del cuerpo.
 *
 * Vive en `packages/app` y no en `apps/web` porque necesita `packages/data` para
 * resolver la sesión, y `apps/web` no puede importar `data` (prohibición 1 de
 * `04-ARQUITECTURA §2`, verificada por lint).
 */

/** Lo mínimo de una petición HTTP que la ruta necesita. Sin acoplarse a Next. */
export interface PeticionHttp {
  readonly method: string;
  json(): Promise<unknown>;
  readonly headers: { get(nombre: string): string | null };
}

export interface RespuestaHttp {
  readonly estado: number;
  readonly cuerpo: unknown;
  readonly cabeceras: Readonly<Record<string, string>>;
}

const NOMBRE_COOKIE = 'morphiqpos_sesion';

/** Lee una cookie del encabezado sin depender del runtime. */
export function leerCookie(cabecera: string | null, nombre: string): string | undefined {
  if (cabecera === null) return undefined;
  for (const parte of cabecera.split(';')) {
    const igual = parte.indexOf('=');
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() !== nombre) continue;
    return decodeURIComponent(parte.slice(igual + 1).trim());
  }
  return undefined;
}

const ESTADO_SESION: Readonly<Record<ResultadoSesionFallida, number>> = {
  ausente: 401,
  invalida: 401,
  expirada: 401,
  revocada: 403,
};

type ResultadoSesionFallida = Exclude<ResultadoSesion, { ok: true }>['motivo'];

const MENSAJE_SESION: Readonly<Record<ResultadoSesionFallida, string>> = {
  ausente: 'Entra con tu PIN para continuar.',
  invalida: 'Tu sesión no es válida. Entra otra vez.',
  expirada: 'La sesión terminó. Vuelve a entrar; tu venta no se perdió.',
  revocada: 'Tu acceso cambió. Pide a un encargado que lo revise.',
};

/**
 * Una definición de comando lista para servirse por HTTP.
 *
 * Es `DefinicionComando` con el tipo de transacción ya fijado. Existe para que
 * `apps/web` no tenga que nombrar `Transaccion` —y por tanto no importe
 * `packages/data`, que es la primera prohibición de `04-ARQUITECTURA §2`.
 */
export type DefinicionServible<E extends ZodType, S> = DefinicionComando<Transaccion, E, S>;

export interface OpcionesRuta {
  /** Secreto de firma. Lo inyecta la ruta desde el entorno validado. */
  readonly secreto: string;
}

/**
 * Convierte una definición de comando en un manejador HTTP.
 *
 * Sólo acepta `POST`: un comando cambia estado, y `GET` que cambia estado es lo
 * que hace posible un CSRF por `<img src>` (morphiq-prs §10A).
 */
export function rutaDeComando<E extends ZodType, S>(
  definicion: DefinicionServible<E, S>,
  opciones: OpcionesRuta,
) {
  return async function manejar(peticion: PeticionHttp): Promise<RespuestaHttp> {
    if (peticion.method !== 'POST') {
      return respuesta(405, { ok: false, error: { codigo: 'METODO', mensaje: 'Usa POST.' } });
    }

    const correlationId = peticion.headers.get('x-correlation-id') ?? undefined;

    const sesion = await resolverSesion({
      secreto: opciones.secreto,
      token: leerCookie(peticion.headers.get('cookie'), NOMBRE_COOKIE),
    });

    if (!sesion.ok) {
      return respuesta(ESTADO_SESION[sesion.motivo], {
        ok: false,
        error: {
          codigo: sesion.motivo === 'revocada' ? 'SIN_PERMISO' : 'NO_AUTENTICADO',
          mensaje: MENSAJE_SESION[sesion.motivo],
        },
      });
    }

    let entrada: unknown;
    try {
      entrada = await peticion.json();
    } catch {
      // Un cuerpo que no es JSON no llega a validarse con zod: se responde
      // igual que una entrada inválida, sin filtrar el error del parser.
      return respuesta(400, {
        ok: false,
        error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'El cuerpo de la petición no es JSON.' },
      });
    }

    const clave = peticion.headers.get('idempotency-key');

    const salida = await comando(definicion, {
      entrada,
      ambito: sesion.ambito,
      ...(clave === null ? {} : { idempotencyKey: clave }),
      ...(correlationId === undefined ? {} : { correlationId }),
    });

    return respuesta(estadoDe(salida), salida, salida.correlationId);
  };
}

function estadoDe<S>(salida: Resultado<S>): number {
  return salida.ok ? 200 : ESTADO_HTTP[salida.error.codigo];
}

function respuesta(estado: number, cuerpo: unknown, correlationId?: string): RespuestaHttp {
  return {
    estado,
    cuerpo,
    cabeceras: {
      // Una respuesta de comando lleva datos del negocio y de la sesión: no se
      // cachea en ningún punto intermedio (morphiq-prs §08).
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...(correlationId === undefined ? {} : { 'x-correlation-id': correlationId }),
    },
  };
}

export { NOMBRE_COOKIE };
