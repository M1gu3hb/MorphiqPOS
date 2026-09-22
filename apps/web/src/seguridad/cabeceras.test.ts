import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { construirCsp } from './csp';

const CONFIG_NEXT =
  process.env['MORPHIQPOS_NEXT_CONFIG_PATH'] ??
  fileURLToPath(new URL('../../next.config.mjs', import.meta.url));
const VERIFICADOR =
  process.env['MORPHIQPOS_HEADERS_VERIFIER_PATH'] ??
  fileURLToPath(new URL('../../../../scripts/verificar-cabeceras.mjs', import.meta.url));

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

  /**
   * `upgrade-insecure-requests` es correcta en produccion y ROMPE una caja en la LAN.
   *
   * La directiva reescribe a `https://` toda peticion `http://` de la pagina. Contra un
   * despliegue que no sirve TLS, el navegador pide https a un puerto que habla texto
   * plano: `ERR_SSL_PROTOCOL_ERROR`, la peticion no llega y la pantalla se queda muda
   * SIN un solo 500 en el servidor. Le paso al portal del comensal en CI.
   *
   * Y A-27 dice que el backend tiene que poder correr en la PC de un cliente sin
   * internet: una caja en la trastienda, servida por http en la LAN, es el escenario
   * para el que se escribio esa regla.
   *
   * La decide la CONFIGURACION del despliegue —`APP_URL`— y nunca la peticion. Sin
   * configuracion se asume https, que es lo seguro: un despliegue mal configurado se
   * queda con la politica estricta, no sin ella.
   */
  it('eleva a https solo cuando el despliegue sirve https', () => {
    expect(construirCsp('abc123', false, true)).toContain('upgrade-insecure-requests');
    expect(construirCsp('abc123', false, false)).not.toContain('upgrade-insecure-requests');
    // Sin decir nada, se asume https.
    expect(produccion).toContain('upgrade-insecure-requests');
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

describe('R-21 · transporte estricto', () => {
  it('envía HSTS por dos años y la comprobación viva lo exige', () => {
    const configuracion = readFileSync(CONFIG_NEXT, 'utf8');
    expect(configuracion).toContain("key: 'Strict-Transport-Security'");
    expect(configuracion).toContain('max-age=63072000; includeSubDomains; preload');

    const verificador = readFileSync(VERIFICADOR, 'utf8');
    expect(verificador).toContain("nombre: 'strict-transport-security'");
    expect(verificador).toContain("v.includes('max-age=63072000')");
  });
});
