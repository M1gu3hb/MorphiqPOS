import { describe, expect, it } from 'vitest';

import { exigirBaseDesechable } from './postgres.ts';

/**
 * Las pruebas de integración borran tablas: su base no puede ser la de producción
 * (bloque B.5 de la 2.4). Sin la guarda, `prepararPostgres` aceptaba cualquier url.
 */
describe('exigirBaseDesechable', () => {
  const PRODUCCION = 'wyqmzhliurwyxuyxznpb';

  it('se niega con el host directo de producción', () => {
    expect(() => {
      exigirBaseDesechable(`postgresql://postgres:x@db.${PRODUCCION}.supabase.co:5432/postgres`);
    }).toThrow(/PRODUCCIÓN/);
  });

  it('se niega con el usuario del pooler de producción', () => {
    expect(() => {
      exigirBaseDesechable(
        `postgresql://postgres.${PRODUCCION}:x@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
      );
    }).toThrow(/PRODUCCIÓN/);
  });

  it('se niega si el proyecto vinculado es producción, aunque la url sea local', () => {
    expect(() => {
      exigirBaseDesechable('postgresql://postgres:postgres@localhost:5432/prueba', PRODUCCION);
    }).toThrow(/MORPHIQPOS_SUPABASE_PROJECT_REF/);
  });

  it('deja pasar una rama (otra referencia) y un Postgres local', () => {
    expect(() => {
      exigirBaseDesechable(
        'postgresql://postgres.abcdefghijklmnopqrst:x@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
      );
    }).not.toThrow();
    expect(() => {
      exigirBaseDesechable('postgresql://postgres:postgres@localhost:5432/prueba', '');
    }).not.toThrow();
  });
});

describe('prepararPostgres', () => {
  it('se niega ANTES de intentar conectarse a una url de producción', async () => {
    // `.invalid` no resuelve nunca: sin la guarda, la función se quedaría 30 s esperando
    // a una base que no contesta, y esta prueba caería por tiempo. Con ella, se niega ya.
    const antes = process.env['DATABASE_URL_PRUEBAS'];
    process.env['DATABASE_URL_PRUEBAS'] =
      'postgresql://postgres:x@db.wyqmzhliurwyxuyxznpb.invalid:5432/postgres';
    try {
      const { prepararPostgres } = await import('./postgres.ts');
      await expect(prepararPostgres()).rejects.toThrow(/PRODUCCIÓN/);
    } finally {
      if (antes === undefined) delete process.env['DATABASE_URL_PRUEBAS'];
      else process.env['DATABASE_URL_PRUEBAS'] = antes;
    }
  });
});
