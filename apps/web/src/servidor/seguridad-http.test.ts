import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { peticionDeEscrituraValida, rolPermitidoParaConsulta } from './seguridad-http';

const FUENTE_HTTP =
  process.env['MORPHIQPOS_WEB_HTTP_SOURCE_PATH'] ??
  fileURLToPath(new URL('./http.ts', import.meta.url));

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
    expect(peticionDeEscrituraValida(peticion)).toBe(true);
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

    expect(peticionDeEscrituraValida(cruzada)).toBe(false);
    expect(peticionDeEscrituraValida(formulario)).toBe(false);
    expect(peticionDeEscrituraValida(sinMarca)).toBe(false);
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
    expect(fuente.slice(desde, hasta)).toContain('if (!peticionDeEscrituraValida(peticion))');
  });
});
