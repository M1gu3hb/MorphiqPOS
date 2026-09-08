import { describe, expect, it } from 'vitest';

import { peticionDeEscrituraValida } from './seguridad-http';

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
