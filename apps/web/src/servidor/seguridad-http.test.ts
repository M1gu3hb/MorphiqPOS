import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { peticionDeEscrituraValida, rolPermitidoParaConsulta } from './seguridad-http';

const FUENTE_HTTP =
  process.env['MORPHIQPOS_WEB_HTTP_SOURCE_PATH'] ??
  fileURLToPath(new URL('./http.ts', import.meta.url));
const FUENTE_SEGURIDAD =
  process.env['MORPHIQPOS_SECURITY_HTTP_SOURCE_PATH'] ??
  fileURLToPath(new URL('./seguridad-http.ts', import.meta.url));
const FUENTE_PORTAL =
  process.env['MORPHIQPOS_PORTAL_HTTP_SOURCE_PATH'] ??
  fileURLToPath(new URL('../../../../packages/app/src/portal/http.ts', import.meta.url));

describe('B-06b · frontera HTTP de escritura', () => {
  it('acepta JSON marcado del mismo origen', () => {
    const peticion = new Request('http://localhost:3000/api/catalogo/productos/crear', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'x-morphiqpos-request': '1',
      },
    });
    expect(peticionDeEscrituraValida(peticion, 'http://localhost:3000')).toBe(true);
  });

  it('rechaza origen cruzado, formulario y peticiones sin la marca del cliente', () => {
    const cruzada = new Request('http://localhost:3000/api/catalogo/productos/crear', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://atacante.example',
        'x-morphiqpos-request': '1',
      },
    });
    const formulario = new Request('http://localhost:3000/api/catalogo/productos/crear', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const sinMarca = new Request('http://localhost:3000/api/catalogo/productos/crear', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    });

    expect(peticionDeEscrituraValida(cruzada, 'http://localhost:3000')).toBe(false);
    expect(peticionDeEscrituraValida(formulario, 'http://localhost:3000')).toBe(false);
    expect(peticionDeEscrituraValida(sinMarca, 'http://localhost:3000')).toBe(false);
  });

  it('rechaza un Host falsificado aunque coincida con Origin', () => {
    const falsificada = new Request('https://atacante.example/api/datos/escribir', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://atacante.example',
        'x-morphiqpos-request': '1',
      },
    });

    expect(peticionDeEscrituraValida(falsificada, 'https://pos.morphiq.example')).toBe(false);
  });
});

describe('C-8 · autorización de consultas GET', () => {
  it('deniega roles fuera de la lista y permite declarar una consulta pública', () => {
    expect(rolPermitidoParaConsulta('cocina', ['dueno', 'administrador'])).toBe(false);
    expect(rolPermitidoParaConsulta('dueno', ['dueno', 'administrador'])).toBe(true);
    expect(rolPermitidoParaConsulta('mesero', undefined)).toBe(true);
  });
});

describe('R-16 · CSRF uniforme en lecturas por POST', () => {
  it('conSesion aplica la misma guarda que los comandos autenticados', () => {
    const fuente = readFileSync(FUENTE_HTTP, 'utf8');
    const desde = fuente.indexOf('export async function conSesion');
    const hasta = fuente.indexOf('function respuestaDeDominio', desde);
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    const bloque = fuente.slice(desde, hasta);
    // Con los MISMOS dos valores configurados que la ruta de comando: la
    // canónica y los alternos. Sin los alternos, una lectura por POST
    // contestaría 403 desde la URL del despliegue mientras la escritura pasa.
    expect(bloque).toMatch(/peticionDeEscrituraValida\(\s*peticion,\s*appUrl,\s*alternas\s*\)/);
    expect(bloque).toMatch(/peticionMultipartValida\(\s*peticion,\s*appUrl,\s*alternas\s*\)/);
    expect(bloque).toContain('if (!peticionValida)');
  });
});

/**
 * El código sin sus comentarios, para no encontrar en un comentario lo que se
 * afirma del código.
 *
 * Las líneas de `//` se quitan SÓLO cuando empiezan la línea. Quitar todo lo que
 * sigue a un `//` en cualquier posición se come media URL —`https://algo`— y con
 * ella la prueba: una mutación que metía `peticion.headers.get('host')` dentro de
 * una plantilla con `https://` pasó la puerta porque el recorte borró la prueba
 * del delito. Medido: la mutación 2 de esta tanda PASÓ antes de arreglar esto.
 */
function sinLosComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('R-17 · el origen esperado nace de la CONFIGURACIÓN, nunca de la petición', () => {
  /**
   * La propiedad es «el origen esperado no sale de la petición», y por eso lo que se
   * afirma es que la guarda NO lee nada de la petición para construirlo. Antes se
   * afirmaba sobre una forma —`new URL(appUrl).origin`— y eso ataba el contrato a
   * una línea concreta: el día que `APP_URL` dejó de ser el único origen válido, la
   * prueba falló sin que la propiedad se hubiera roto.
   */
  it('la guarda compartida no mira el host ni la url de la petición', () => {
    const fuente = readFileSync(FUENTE_SEGURIDAD, 'utf8');
    const sinComentarios = sinLosComentarios(fuente);
    expect(sinComentarios).not.toContain('peticion.url');
    expect(sinComentarios).not.toContain('x-forwarded-host');
    expect(sinComentarios).not.toContain("get('host')");
    // Y sí mira los dos valores configurados: la canónica y los alternos.
    expect(sinComentarios).toContain('appUrl');
    expect(sinComentarios).toContain('alternas');
  });

  it('el portal no confía en el Host de la petición', () => {
    const fuente = readFileSync(FUENTE_PORTAL, 'utf8');
    const sinComentarios = sinLosComentarios(fuente);
    expect(sinComentarios).not.toContain('new URL(peticion.url).origin');
    expect(sinComentarios).toContain('validarEntorno(process.env)');
    expect(sinComentarios).toContain('APP_URL_ALTERNAS');
  });
});

describe('APP_URL_ALTERNAS · el mismo despliegue servido por dos dominios', () => {
  /**
   * El defecto que esto cierra: `APP_URL` apuntaba al dominio propio y el
   * despliegue se servía también por su `*.vercel.app`. Toda escritura desde esa
   * URL —empezando por entrar— contestaba 403, y ninguna puerta lo vio porque las
   * suites corren con `APP_URL=http://localhost:3200`, donde el origen coincide
   * siempre.
   */
  const desde = (origen: string) =>
    new Request('https://morphiqpos-kappa.vercel.app/api/auth/entrar', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: origen,
        'x-morphiqpos-request': '1',
      },
    });

  it('acepta un origen alterno declarado', () => {
    expect(
      peticionDeEscrituraValida(
        desde('https://morphiqpos-kappa.vercel.app'),
        'https://pos.morphiq.example',
        'https://morphiqpos-kappa.vercel.app',
      ),
    ).toBe(true);
  });

  it('sigue rechazando un tercero, con alternos configurados o sin ellos', () => {
    expect(
      peticionDeEscrituraValida(
        desde('https://atacante.example'),
        'https://pos.morphiq.example',
        'https://morphiqpos-kappa.vercel.app',
      ),
    ).toBe(false);
    expect(
      peticionDeEscrituraValida(desde('https://atacante.example'), 'https://pos.morphiq.example'),
    ).toBe(false);
  });

  it('una entrada vacía o mal escrita en la lista no abre la puerta', () => {
    expect(
      peticionDeEscrituraValida(
        desde('https://atacante.example'),
        'https://pos.morphiq.example',
        ' , , sin-esquema.example , ',
      ),
    ).toBe(false);
  });
});
