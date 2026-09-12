import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ARCHIVO =
  process.env['MORPHIQPOS_ROUTINES_MIGRATION_PATH'] ??
  join(dirname(fileURLToPath(import.meta.url)), 'sql', '055_revocar_rutinas_publicas.sql');

describe('migración 055: las rutinas public no salen por PostgREST', () => {
  it('existe como migración nueva y forward-only', () => {
    expect(existsSync(ARCHIVO)).toBe(true);
  });

  it('revoca funciones existentes y el privilegio por omisión', () => {
    if (!existsSync(ARCHIVO)) return;
    const sql = readFileSync(ARCHIVO, 'utf8').toLowerCase();

    expect(sql).toContain('revoke execute on all functions in schema public from public;');
    expect(sql).toContain(
      'alter default privileges in schema public revoke execute on functions from public;',
    );
    expect(sql).toContain("rolname in ('anon', 'authenticated')");
  });
});
