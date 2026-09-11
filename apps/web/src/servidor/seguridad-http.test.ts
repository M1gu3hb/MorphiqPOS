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
    expect(fuente.slice(desde, hasta)).toContain('if (!peticionDeEscrituraValida(peticion,');
  });
});

describe('R-17 · el origen esperado nace de APP_URL', () => {
  it('la guarda compartida compara contra la URL configurada', () => {
    const fuente = readFileSync(FUENTE_SEGURIDAD, 'utf8');
    expect(fuente).toContain('new URL(appUrl).origin');
    expect(fuente).not.toContain('new URL(peticion.url).origin');
  });

  it('el portal no confía en el Host de la petición', () => {
    const fuente = readFileSync(FUENTE_PORTAL, 'utf8');
    expect(fuente).not.toContain('new URL(peticion.url).origin');
    expect(fuente).toContain('new URL(validarEntorno(process.env).APP_URL).origin');
  });
});
