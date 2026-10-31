import { afterEach, describe, expect, it } from 'vitest';

import { PROYECTO_DE_LA_FASE_A, proyectoVerificado } from './consulta-directa.ts';

/**
 * DP-10.5 · `verify:esquema`, `verify:rls` y `verify:acople` comparan contra UN proyecto de
 * Supabase y se niegan a mirar otro. Tenían clavado el de la Fase A; el día de la mudanza tienen
 * que poder mirar el nuevo sin tocar el código: lo dice `MORPHIQPOS_PROYECTO_VERIFICADO`.
 */

const CLAVE = 'MORPHIQPOS_PROYECTO_VERIFICADO';
const antes = process.env[CLAVE];

afterEach(() => {
  if (antes === undefined) delete process.env[CLAVE];
  else process.env[CLAVE] = antes;
});

describe('proyectoVerificado', () => {
  it('sin la variable, el de la Fase A', () => {
    process.env[CLAVE] = '';
    expect(proyectoVerificado()).toBe(PROYECTO_DE_LA_FASE_A);
    expect(PROYECTO_DE_LA_FASE_A).toBe('wyqmzhliurwyxuyxznpb');
  });

  it('con la variable, el que diga', () => {
    process.env[CLAVE] = 'abcdefghijklmnopqrst';
    expect(proyectoVerificado()).toBe('abcdefghijklmnopqrst');
  });

  it('una referencia que no tiene forma de referencia no se acepta', () => {
    process.env[CLAVE] = 'db.otro.supabase.co';
    expect(() => proyectoVerificado()).toThrow(/MORPHIQPOS_PROYECTO_VERIFICADO/);
  });
});
