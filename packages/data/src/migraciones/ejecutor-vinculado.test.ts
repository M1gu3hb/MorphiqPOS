import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { prepararTandaVinculada } from './ejecutor.ts';

const EJECUTOR = fileURLToPath(new URL('./ejecutor.ts', import.meta.url));
const BIN = fileURLToPath(new URL('../../bin/migrar.mjs', import.meta.url));
const TIPOS = fileURLToPath(new URL('../../bin/generar-tipos.mjs', import.meta.url));

describe('ejecutor de migraciones por Management API', () => {
  it('expone un constructor comprobable para la tanda SQL', () => {
    const codigo = readFileSync(EJECUTOR, 'utf8');
    expect(codigo).toMatch(/export function prepararTandaVinculada/);
  });

  it('expone el ejecutor vinculado que conserva el mismo ledger', () => {
    const codigo = readFileSync(EJECUTOR, 'utf8');
    expect(codigo).toMatch(/export function migrarVinculado/);
  });

  it('pnpm db:migrate selecciona el transporte vinculado de forma explícita', () => {
    const codigo = readFileSync(BIN, 'utf8');
    expect(codigo).toContain('MORPHIQPOS_SUPABASE_PROJECT_REF');
    expect(codigo).toContain('migrarVinculado');
  });

  it('pnpm db:tipos usa el mismo proyecto vinculado cuando falta DATABASE_URL', () => {
    const codigo = readFileSync(TIPOS, 'utf8');
    expect(codigo).toContain('MORPHIQPOS_SUPABASE_PROJECT_REF');
    expect(codigo).toContain('supabase db query');
  });

  it('ejecuta el CLI desde la raíz para no crear configuración dentro del paquete', () => {
    const codigo = readFileSync(EJECUTOR, 'utf8');
    expect(codigo).toContain('cwd: RAIZ');
  });

  it('envuelve todas las migraciones y sus filas de ledger en una sola transacción', () => {
    const sql = prepararTandaVinculada(
      [
        {
          version: 50,
          nombre: 'rls_faltante',
          archivo: '050_rls_faltante.sql',
          sql: 'select 50;',
          hash: 'c9e7c585886e5b96',
        },
      ],
      false,
    );

    expect(sql).toMatch(/^begin;/);
    expect(sql).toContain('select 50;');
    expect(sql).toContain(
      "insert into _migraciones (version, nombre, hash, duracion_ms) values (50, 'rls_faltante', 'c9e7c585886e5b96', 0);",
    );
    expect(sql).toMatch(/commit;\s*$/);
  });

  it('revierte el ensayo y escapa los literales del ledger', () => {
    const sql = prepararTandaVinculada(
      [
        {
          version: 51,
          nombre: "sesion_d'usuario",
          archivo: '051_sesion.sql',
          sql: 'select 51;',
          hash: "abc'def",
        },
      ],
      true,
    );

    expect(sql).toContain("'sesion_d''usuario'");
    expect(sql).toContain("'abc''def'");
    expect(sql).toMatch(/rollback;\s*$/);
  });
});
