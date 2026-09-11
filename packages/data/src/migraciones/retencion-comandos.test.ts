import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
});
