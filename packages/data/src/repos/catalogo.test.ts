import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { Esquema } from '../esquema.ts';
import { construirBusquedaProductos } from './catalogo.ts';

const pool = new pg.Pool({ connectionString: 'postgresql://prueba:prueba@localhost/prueba' });
const db = new Kysely<Esquema>({ dialect: new PostgresDialect({ pool }) });
const FUENTE =
  process.env['MORPHIQPOS_CATALOG_SEARCH_SOURCE_PATH'] ??
  fileURLToPath(new URL('./catalogo.ts', import.meta.url));

afterAll(async () => pool.end());

describe('B-06 · consulta paginada de productos', () => {
  it('compila búsqueda difusa, ámbito y columnas explícitas', () => {
    const consulta = construirBusquedaProductos(db, 'org-1', {
      busqueda: 'tornilo',
      categoriaId: 'categoria-1',
      limite: 24,
    }).compile();

    expect(consulta.sql).toContain('operator(extensions.%)');
    expect(consulta.sql).toContain('"p"."organizacion_id" = $');
    expect(consulta.sql).toContain('"p"."activo" = $');
    expect(consulta.sql).toContain('"p"."categoria_id" = $');
    expect(consulta.sql).toContain('limit $');
    expect(consulta.sql).not.toContain('select *');
    expect(consulta.parameters).toContain(25);
  });

  it('pagina por updated_at e id sin offset', () => {
    const consulta = construirBusquedaProductos(db, 'org-1', {
      cursor: {
        updatedAt: new Date('2026-09-07T20:15:00.000Z'),
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      limite: 12,
    }).compile();

    expect(consulta.sql).toContain('"p"."updated_at" < $');
    expect(consulta.sql).toContain('"p"."id" < $');
    expect(consulta.sql).toContain('order by "p"."updated_at" desc, "p"."id" desc');
    expect(consulta.sql).not.toContain('offset');
    expect(consulta.parameters).toContain(13);
  });

  it('trata %, _ y barra inversa como texto literal en ILIKE', () => {
    const consulta = construirBusquedaProductos(db, 'org-1', {
      busqueda: '50%_\\',
    }).compile();

    expect(consulta.parameters).toContain('%50\\%\\_\\\\%');
    expect(consulta.parameters).not.toContain('%50%_\\%');
    expect(readFileSync(FUENTE, 'utf8')).toContain('escaparPatronIlike(busqueda)');
  });
});
