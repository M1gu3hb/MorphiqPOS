import type { ErrorComando, Resultado } from '@morphiqpos/contracts';

/**
 * El único camino del navegador al servidor (F1.1-X-01).
 *
 * Todo comando se invoca por aquí. La razón no es comodidad: es que
 * `Idempotency-Key` no puede ser opcional. Si cada pantalla hace su `fetch`, la
 * que se olvide de mandarla duplica un cobro en el primer doble clic, y no se
 * descubre hasta que un arqueo no cuadre.
 *
 * Aquí la clave se genera sola y se conserva entre reintentos, así que
 * olvidarla no es una opción disponible.
 */

export class ErrorApi extends Error {
  constructor(
    readonly error: ErrorComando,
    readonly estado: number,
    readonly correlationId: string | null,
  ) {
    super(error.mensaje);
    this.name = 'ErrorApi';
  }
}

export interface OpcionesComando {
  /**
   * Reusar la clave entre reintentos es lo que hace idempotente al reintento.
   * Si se omite, se genera una nueva: correcto para una operación nueva,
   * incorrecto para reintentar una que quizá ya se aplicó.
   */
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

/**
 * Invoca un comando del servidor.
 *
 * Devuelve los datos, o lanza `ErrorApi` con el código estable. Lanzar aquí sí
 * es correcto —al revés que en el envoltorio del servidor— porque quien llama
 * es un manejador de React que ya vive dentro de un `try`, y el tipo de retorno
 * queda limpio para el camino feliz.
 */
export async function invocarComando<T>(
  ruta: string,
  entrada: unknown,
  opciones: OpcionesComando = {},
): Promise<T> {
  const respuesta = await fetch(ruta, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': opciones.idempotencyKey ?? nuevaClave(),
    },
    body: JSON.stringify(entrada),
    // La cookie es `HttpOnly`: el navegador la adjunta, el script no la ve.
    credentials: 'same-origin',
    ...(opciones.signal === undefined ? {} : { signal: opciones.signal }),
  });

  const correlationId = respuesta.headers.get('x-correlation-id');
  const cuerpo: unknown = await respuesta.json().catch(() => null);

  if (!esResultado<T>(cuerpo)) {
    throw new ErrorApi(
      { codigo: 'ERROR_INTERNO', mensaje: 'El servidor respondió algo inesperado.' },
      respuesta.status,
      correlationId,
    );
  }

  if (!cuerpo.ok) throw new ErrorApi(cuerpo.error, respuesta.status, correlationId);
  return cuerpo.datos;
}

/**
 * Una clave por operación.
 *
 * `crypto.randomUUID` existe en todo navegador con contexto seguro; el respaldo
 * cubre `http://` en la red local, que es justo donde se hace la demostración.
 */
export function nuevaClave(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function esResultado<T>(valor: unknown): valor is Resultado<T> {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as { ok?: unknown };
  return typeof v.ok === 'boolean';
}
