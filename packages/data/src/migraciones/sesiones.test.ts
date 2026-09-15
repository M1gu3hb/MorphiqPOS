import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ARCHIVO =
  process.env['MORPHIQPOS_SESIONES_MIGRATION_PATH'] ??
  join(dirname(fileURLToPath(import.meta.url)), 'sql', '051_sesiones_revocables.sql');

describe('migración 051: sesiones revocables', () => {
  it('existe como migración nueva y forward-only', () => {
    expect(existsSync(ARCHIVO)).toBe(true);
  });

  it('persiste el sid, su ámbito mínimo, vencimiento y revocación', () => {
    if (!existsSync(ARCHIVO)) return;
    const sql = readFileSync(ARCHIVO, 'utf8').toLowerCase();

    expect(sql).toMatch(/create table sesiones\s*\(/);
    expect(sql).toMatch(/sid\s+text\s+primary key/);
    expect(sql).toMatch(/organizacion_id\s+uuid\s+not null/);
    expect(sql).toMatch(/empleo_id\s+uuid\s+not null/);
    expect(sql).toMatch(/creada_en\s+timestamptz\s+not null/);
    expect(sql).toMatch(/expira_en\s+timestamptz\s+not null/);
    expect(sql).toMatch(/revocada_en\s+timestamptz/);
  });

  it('ata el empleo a la misma organización y prepara resolución y purga', () => {
    if (!existsSync(ARCHIVO)) return;
    const sql = readFileSync(ARCHIVO, 'utf8').toLowerCase();

    expect(sql).toMatch(/foreign key\s*\(empleo_id,\s*organizacion_id\)/);
    expect(sql).toMatch(/references empleos\s*\(id,\s*organizacion_id\)/);
    expect(sql).toMatch(/create index sesiones_empleo_activas/);
    expect(sql).toMatch(/where revocada_en is null/);
    expect(sql).toMatch(/create index sesiones_expira_en/);
  });

  it('nace cerrada a clientes directos y con RLS forzado', () => {
    if (!existsSync(ARCHIVO)) return;
    const sql = readFileSync(ARCHIVO, 'utf8').toLowerCase();

    expect(sql).toContain('enable row level security');
    expect(sql).toContain('force row level security');
    expect(sql).toContain('revoke all privileges on table sesiones from');
    expect(sql).toContain("rolname in ('anon', 'authenticated')");
  });
});
