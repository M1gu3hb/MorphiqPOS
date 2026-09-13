import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MIGRACION =
  process.env['MORPHIQPOS_FILE_QUOTA_MIGRATION_PATH'] ??
  join(dirname(fileURLToPath(import.meta.url)), 'sql', '056_cuota_archivos_atomica.sql');

describe('migración 056: contador atómico de archivos', () => {
  it('crea el contador acotado por organización y protegido por RLS', () => {
    expect(existsSync(MIGRACION)).toBe(true);
    if (!existsSync(MIGRACION)) return;
    const sql = readFileSync(MIGRACION, 'utf8').toLowerCase();

    expect(sql).toContain('create table cuotas_archivos');
    expect(sql).toMatch(/bytes_usados\s+bigint/);
    expect(sql).toMatch(/check\s*\(bytes_usados\s*>=\s*0\)/);
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('force row level security');
    expect(sql).toContain('morphiqpos_app');
  });
});
