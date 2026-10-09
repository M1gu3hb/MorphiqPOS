import { describe, expect, it } from 'vitest';

import { crearRegistroDeIntentos, esRespuestaDefinitiva } from './claves-de-intento.ts';

/**
 * La misma clave para el mismo intento (auditoría de la 2.4): un abono cuya respuesta se
 * perdió, reintentado, tiene que llevar LA MISMA clave para que el servidor no lo
 * registre dos veces; y el siguiente abono igual, ya contestado el primero, otra.
 */

function registro() {
  let n = 0;
  return crearRegistroDeIntentos(() => `clave-${String(++n)}`, 1_000);
}

const ABONO = '/api/fiado/abono {"clienteId":"c1","montoCentavos":30000}';

describe('las claves de intento', () => {
  it('SIN RESPUESTA (red caída) el reintento lleva la misma clave', () => {
    const r = registro();
    const primera = r.claveDe(ABONO, 0);
    // fetch lanzó: nadie llamó a `respondio`.
    expect(r.claveDe(ABONO, 100)).toBe(primera);
  });

  it('con 5xx, 409 o 429 la clave se queda para el reintento', () => {
    for (const estado of [500, 503, 409, 429]) {
      const r = registro();
      const primera = r.claveDe(ABONO, 0);
      r.respondio(ABONO, estado);
      expect(r.claveDe(ABONO, 10)).toBe(primera);
    }
  });

  it('con respuesta DEFINITIVA el siguiente pedido igual es otro intento', () => {
    for (const estado of [200, 201, 400, 403, 404, 422]) {
      const r = registro();
      const primera = r.claveDe(ABONO, 0);
      r.respondio(ABONO, estado);
      expect(r.claveDe(ABONO, 10)).not.toBe(primera);
    }
  });

  it('dos pedidos distintos no comparten clave', () => {
    const r = registro();
    expect(r.claveDe(ABONO, 0)).not.toBe(r.claveDe(`${ABONO} `, 0));
  });

  it('un intento que nadie reintentó caduca', () => {
    const r = registro();
    const primera = r.claveDe(ABONO, 0);
    expect(r.claveDe(ABONO, 5_000)).not.toBe(primera);
  });

  it('qué es definitivo', () => {
    expect(esRespuestaDefinitiva(200)).toBe(true);
    expect(esRespuestaDefinitiva(400)).toBe(true);
    expect(esRespuestaDefinitiva(409)).toBe(false);
    expect(esRespuestaDefinitiva(429)).toBe(false);
    expect(esRespuestaDefinitiva(502)).toBe(false);
  });
});

describe('invocarComando usa el registro (contrato sobre api.ts)', () => {
  it('la clave sale del registro y la respuesta lo suelta, no de `nuevaClave()` suelta', async () => {
    const { readFileSync } = await import('node:fs');
    const texto = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
    const inicio = texto.indexOf('export async function invocarComando');
    const fin = texto.indexOf('\n}\n', inicio);
    const cuerpo = texto.slice(inicio, fin).replace(/^\s*\/\/.*$/gm, '');

    expect(cuerpo).toMatch(/opciones\.idempotencyKey\s*\?\?\s*INTENTOS\.claveDe\(/);
    expect(cuerpo).toMatch(/INTENTOS\.respondio\(\s*firma,\s*respuesta\.status\s*\)/);
    expect(cuerpo).not.toMatch(/nuevaClave\(\)/);
  });
});
