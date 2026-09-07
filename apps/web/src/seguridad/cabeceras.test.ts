import { describe, expect, it } from 'vitest';

import { construirCsp } from './csp';

/**
 * SEC-HEADERS de `06-DEFECTOS §4`: ninguno de los dos sistemas fuente enviaba
 * cabeceras de seguridad.
 *
 * Estas pruebas comprueban la POLITICA, no que el servidor arranque. La
 * comprobacion en vivo la hace `pnpm verify:cabeceras` contra el servidor real.
 * Hacen falta las dos: una prueba de la cadena no garantiza que Next la envie,
 * y una prueba en vivo no explica que directiva falta.
 */

describe('la Content-Security-Policy', () => {
  const produccion = construirCsp('abc123', false);
  const desarrollo = construirCsp('abc123', true);

  it('lleva el nonce de la peticion en script-src', () => {
    expect(produccion).toContain("'nonce-abc123'");
  });

  it('NUNCA permite scripts en linea sin nonce', () => {
    // Es la directiva que hace inofensivo un nombre de mesa con HTML dentro
    // aunque alguien se equivoque al renderizarlo (SEC-XSS).
    const scriptSrc = produccion.split('; ').find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('solo permite evaluar codigo en desarrollo, y por el recargado en caliente', () => {
    expect(desarrollo).toContain("'unsafe-eval'");
    expect(produccion).not.toContain("'unsafe-eval'");
  });

  it('prohibe que la aplicacion se meta en un iframe ajeno', () => {
    expect(produccion).toContain("frame-ancestors 'none'");
  });

  it('limita las conexiones al propio origen', () => {
    // El navegador NO habla con Postgres ni con el almacenamiento: pasa por
    // /api (04-ARQUITECTURA §4). Si algun dia hace falta otro origen, se agrega
    // aqui a proposito y esta prueba obliga a razonarlo.
    expect(produccion).toContain("connect-src 'self'");
  });

  it('declara las directivas de cierre que suelen olvidarse', () => {
    for (const directiva of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(produccion, `falta ${directiva}`).toContain(directiva);
    }
  });
});
