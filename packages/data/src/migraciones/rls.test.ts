import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ARCHIVO =
  process.env['MORPHIQPOS_RLS_MIGRATION_PATH'] ??
  join(dirname(fileURLToPath(import.meta.url)), 'sql', '050_rls_faltante.sql');

describe('migración 050: blindaje de todo el esquema public', () => {
  it('existe como migración nueva y forward-only', () => {
    expect(existsSync(ARCHIVO)).toBe(true);
  });

  it('descubre las tablas en el catálogo en vez de mantener otra lista manual', () => {
    if (!existsSync(ARCHIVO)) return;
    const contenido = readFileSync(ARCHIVO, 'utf8');
    const sql = contenido.toLowerCase();

    expect(sql).toContain('pg_catalog.pg_class');
    expect(sql).toContain('pg_catalog.pg_namespace');
    expect(sql).toMatch(/relkind\s+in\s*\(\s*'r'\s*,\s*'p'\s*\)/);
    expect(sql).toContain("nspname = 'public'");
  });

  it('activa y fuerza RLS en cada tabla public', () => {
    if (!existsSync(ARCHIVO)) return;
    const sql = readFileSync(ARCHIVO, 'utf8').toLowerCase();

    expect(sql).toContain('enable row level security');
    expect(sql).toContain('force row level security');
  });

  it('retira privilegios de anon y authenticated también en vistas y secuencias', () => {
    if (!existsSync(ARCHIVO)) return;
    const contenido = readFileSync(ARCHIVO, 'utf8');
    const sql = contenido.toLowerCase();

    expect(sql).toContain("rolname in ('anon', 'authenticated')");
    // pg_class usa una S mayúscula para las secuencias. Convertimos sólo la
    // comparación a minúsculas para que el test detecte el literal incorrecto.
    expect(contenido).toContain("relkind in ('r', 'p', 'v', 'm', 'S')");
    expect(contenido).toContain("relacion.relkind = 'S'");
    expect(sql).toContain('revoke all privileges on');
    expect(sql).toContain('alter default privileges in schema public');
  });
});
