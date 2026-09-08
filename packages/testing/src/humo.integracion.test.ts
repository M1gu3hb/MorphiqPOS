import { describe, expect, it } from 'vitest';

/**
 * Humo de la suite de integracion.
 *
 * Comprueba que el andamiaje de F1.0-T10 hizo su trabajo: que hay una base
 * lista y su URL llego al entorno. Si esta prueba falla, ninguna de las de
 * integracion que vengan despues significa nada.
 */
describe('andamiaje de integracion', () => {
  it('el arranque dejo una base de datos disponible', () => {
    const url = process.env['DATABASE_URL'];
    expect(url, 'pruebas/postgres.setup.ts no dejo DATABASE_URL').toBeDefined();
    expect(url).toMatch(/^postgres:\/\//);
  });
});
