import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ARCHIVO =
  process.env['MORPHIQPOS_QR_TOKEN_MIGRATION_PATH'] ??
  join(dirname(fileURLToPath(import.meta.url)), 'sql', '052_qr_token_unico.sql');

describe('migración 052: token QR único por organización', () => {
  it('existe como migración nueva y forward-only', () => {
    expect(existsSync(ARCHIVO)).toBe(true);
  });

  it('impide reutilizar un token no nulo dentro del negocio', () => {
    if (!existsSync(ARCHIVO)) return;
    const sql = readFileSync(ARCHIVO, 'utf8').toLowerCase();

    expect(sql).toContain('drop index if exists mesas_qr_token_unico');
    expect(sql).toMatch(/create unique index mesas_qr_token_unico/);
    expect(sql).toMatch(/on mesas\s*\(organizacion_id,\s*qr_token\)/);
    expect(sql).toContain('where qr_token is not null');
  });
});
