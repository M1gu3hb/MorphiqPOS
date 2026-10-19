import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorSinRespuesta, invocarComando } from './api.ts';

/**
 * LA RESPUESTA QUE NO LLEGÓ (cierre de la 2.4).
 *
 * El servidor cobra, el módem se cae y la caja no se entera. La pantalla tiene que decir
 * lo que sí se sabe —que pudo haberse hecho y que tocar otra vez es seguro—, y el
 * reintento tiene que llevar la MISMA clave para que el servidor devuelva lo que ya hizo.
 * La suite del día de la tienda lo recorre contra el servidor; aquí, el contrato.
 */

const VENTA = { ok: true, datos: { ventaId: 'v-1' }, correlationId: 'c-1' };

function respuesta(cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('invocarComando, cuando la respuesta no llega', () => {
  it('dice en español qué hacer, y el reintento lleva la misma clave', async () => {
    const claves: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_ruta: string, init: RequestInit) => {
        claves.push(new Headers(init.headers).get('idempotency-key') ?? '');
        return claves.length === 1
          ? Promise.reject(new TypeError('Failed to fetch'))
          : Promise.resolve(respuesta(VENTA));
      }),
    );
    const cobrar = () => invocarComando('/api/venta/cobrar-mostrador', { totalCentavos: 4_290 });

    const primera = cobrar();
    await expect(primera).rejects.toBeInstanceOf(ErrorSinRespuesta);
    await expect(primera).rejects.toThrow(/puede que sí se haya hecho/);
    await expect(primera).rejects.not.toThrow(/Failed to fetch/);

    expect(await cobrar()).toEqual({ ventaId: 'v-1' });
    expect(claves).toHaveLength(2);
    expect(claves[1]).toBe(claves[0]);

    // Contestado, el siguiente cobro igual es OTRA venta, con otra clave.
    await cobrar();
    expect(claves[2]).not.toBe(claves[0]);
  });

  it('un abort de quien llama no se disfraza de red caída', async () => {
    const control = new AbortController();
    const abortado = new DOMException('Se fue de la pantalla.', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        control.abort();
        return Promise.reject(abortado);
      }),
    );
    await expect(invocarComando('/api/venta/estado', {}, { signal: control.signal })).rejects.toBe(
      abortado,
    );
  });
});
