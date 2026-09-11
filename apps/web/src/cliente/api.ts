import type { ErrorComando, Resultado } from '@morphiqpos/contracts';

/** Camino único del navegador al servidor, con cookie HttpOnly e idempotencia. */
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
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

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
      'x-morphiqpos-request': '1',
    },
    body: JSON.stringify(entrada),
    credentials: 'same-origin',
    ...(opciones.signal === undefined ? {} : { signal: opciones.signal }),
  });
  return leerResultado<T>(respuesta);
}

/** Alias usado por las pantallas de gestión. */
export function ejecutarApi<T>(ruta: string, entrada: unknown): Promise<T> {
  return invocarComando<T>(ruta, entrada);
}

export async function obtenerApi<T>(ruta: string): Promise<T> {
  const respuesta = await fetch(ruta, { cache: 'no-store', credentials: 'same-origin' });
  return leerResultado<T>(respuesta);
}

export function nuevaClave(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function leerResultado<T>(respuesta: Response): Promise<T> {
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

function esResultado<T>(valor: unknown): valor is Resultado<T> {
  if (typeof valor !== 'object' || valor === null) return false;
  const candidato = valor as { ok?: unknown };
  return typeof candidato.ok === 'boolean';
}
