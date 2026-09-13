import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { prepararSqlMigracion } from './ejecutor.ts';
import { leerMigraciones } from './lectura.ts';

const MIGRACION =
  process.env['MORPHIQPOS_COMMAND_RETENTION_MIGRATION_PATH'] ??
  join(dirname(fileURLToPath(import.meta.url)), 'sql', '053_retencion_comandos.sql');

describe('R-15 · retención de comandos ejecutados', () => {
  it('crea un trabajo diario administrado por PostgreSQL', () => {
    expect(existsSync(MIGRACION)).toBe(true);
    if (!existsSync(MIGRACION)) return;

    const sql = readFileSync(MIGRACION, 'utf8').toLowerCase();
    expect(sql).toContain('create extension if not exists pg_cron');
    expect(sql).toContain('cron.schedule');
    expect(sql).toContain("'morphiqpos_retencion_comandos'");
    expect(sql).toContain("'17 3 * * *'");
  });

  it('elimina únicamente registros con más de 90 días', () => {
    if (!existsSync(MIGRACION)) return;
    const sql = readFileSync(MIGRACION, 'utf8').toLowerCase();

    expect(sql).toContain('delete from public.comandos_ejecutados');
    expect(sql).toMatch(/created_at\s*<\s*now\(\)\s*-\s*interval\s+'90 days'/);
  });

  it('conserva el hash original y vuelve pg_cron opcional al ejecutar en PostgreSQL puro', () => {
    const migracion = leerMigraciones().find(({ version }) => version === 53);
    expect(migracion).toBeDefined();
    if (migracion === undefined) return;

    const ejecutable = prepararSqlMigracion(migracion);

    expect(ejecutable).toContain("to_regprocedure('cron.schedule(text,text,text)')");
    expect(ejecutable).toContain('raise notice');
    expect(ejecutable.toLowerCase()).toContain('purga manual');
    expect(migracion.sql).toContain('create extension if not exists pg_cron');
  });
});
