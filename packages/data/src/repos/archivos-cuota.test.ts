import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { Esquema } from '../esquema.ts';
import { construirReservaCuotaArchivo } from './archivos.ts';

const REPOSITORIO =
  process.env['MORPHIQPOS_FILE_QUOTA_REPOSITORY_PATH'] ??
  fileURLToPath(new URL('./archivos.ts', import.meta.url));

const pool = new pg.Pool({ connectionString: 'postgresql://prueba:prueba@localhost/prueba' });
const db = new Kysely<Esquema>({ dialect: new PostgresDialect({ pool }) });

afterAll(async () => pool.end());

describe('O-4 · reserva atómica de cuota de archivos', () => {
  it('suma y decide el límite dentro de un único upsert condicional', () => {
    const consulta = construirReservaCuotaArchivo(db, {
      organizacionId: '11111111-1111-4111-8111-111111111111',
      bytesNuevos: 5 * 1024 * 1024,
      limiteBytes: 500 * 1024 * 1024,
      bytesObservados: 120 * 1024 * 1024,
    }).compile();

    expect(consulta.sql).toContain('insert into "cuotas_archivos"');
    expect(consulta.sql).toContain('on conflict ("organizacion_id") do update');
    expect(consulta.sql).toContain('greatest');
    expect(consulta.sql).toContain('where');
    expect(consulta.sql).toContain('returning "bytes_usados"');
  });

  it('mantiene la suma y el límite dentro del mismo upsert', () => {
    const fuente = readFileSync(REPOSITORIO, 'utf8');

    expect(fuente).toContain(".insertInto('cuotas_archivos')");
    expect(fuente).toContain('.onConflict((conflicto) =>');
    expect(fuente).toContain('greatest(cuotas_archivos.bytes_usados, ${bytesObservados})');
    expect(fuente.match(/\+ \$\{bytesNuevos\} <= \$\{limiteBytes\}/g)).toHaveLength(1);
  });
});
