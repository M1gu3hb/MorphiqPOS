import type { Resultado } from '@morphiqpos/contracts';

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export async function obtenerApi<T>(ruta: string): Promise<T> {
  const respuesta = await fetch(ruta, { cache: 'no-store' });
  const carga: unknown = await respuesta.json();
  if (!respuesta.ok) throw new ErrorApi(mensajeDe(carga), respuesta.status);
  return extraerDatos(carga) as T;
}

export async function ejecutarApi<T>(ruta: string, entrada: unknown): Promise<T> {
  const respuesta = await fetch(ruta, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
      'x-morphiqpos-request': '1',
    },
    body: JSON.stringify(entrada),
  });
  const carga: unknown = await respuesta.json();
  if (!respuesta.ok) throw new ErrorApi(mensajeDe(carga), respuesta.status);
  const resultado = carga as Resultado<T>;
  if (!resultado.ok) throw new ErrorApi(resultado.error.mensaje, respuesta.status);
  return resultado.datos;
}

function extraerDatos(carga: unknown): unknown {
  if (typeof carga !== 'object' || carga === null || !('datos' in carga)) {
    throw new ErrorApi('El servidor devolvió una respuesta inválida.', 500);
  }
  return carga.datos;
}

function mensajeDe(carga: unknown): string {
  if (typeof carga !== 'object' || carga === null || !('error' in carga)) {
    return 'No fue posible completar la operación.';
  }
  const error = carga.error;
  return typeof error === 'object' &&
    error !== null &&
    'mensaje' in error &&
    typeof error.mensaje === 'string'
    ? error.mensaje
    : 'No fue posible completar la operación.';
}
