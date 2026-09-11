#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRACION_RLS = join(
  RAIZ,
  'packages',
  'data',
  'src',
  'migraciones',
  'sql',
  '050_rls_faltante.sql',
);
const PRUEBA_RLS = 'packages/data/src/migraciones/rls.test.ts';
const VITEST = join(RAIZ, 'node_modules', 'vitest', 'vitest.mjs');

function exigirCambio(nombre, original, mutado) {
  if (mutado === original) {
    throw new Error(`La mutación "${nombre}" no cambió el archivo objetivo.`);
  }
}

function comprobarMutacion(nombre, transformar) {
  const carpeta = mkdtempSync(join(tmpdir(), 'morphiqpos-mutacion-'));
  const archivo = join(carpeta, '050_rls_faltante.sql');
  const original = readFileSync(MIGRACION_RLS, 'utf8');
  const mutado = transformar(original);
  exigirCambio(nombre, original, mutado);
  writeFileSync(archivo, mutado, 'utf8');

  try {
    const resultado = spawnSync(
      process.execPath,
      [
        VITEST,
        'run',
        PRUEBA_RLS,
        '--reporter',
        'dot',
        '--pool',
        'forks',
        '--maxWorkers',
        '1',
        '--no-file-parallelism',
        '--teardownTimeout',
        '1000',
      ],
      {
        cwd: RAIZ,
        encoding: 'utf8',
        env: { ...process.env, MORPHIQPOS_RLS_MIGRATION_PATH: archivo },
        windowsHide: true,
      },
    );

    if (resultado.error !== undefined) throw resultado.error;
    if (resultado.status === 0) {
      throw new Error(`La suite sobrevivió a la mutación "${nombre}".`);
    }
  } finally {
    rmSync(carpeta, { force: true, recursive: true });
  }

  console.log(`✓ Mutación rechazada: ${nombre}`);
}

comprobarMutacion('RLS FORCE eliminado', (sql) =>
  sql.replaceAll('force row level security', 'disable row level security'),
);
comprobarMutacion('secuencias excluidas del REVOKE', (sql) =>
  sql.replace("('r', 'p', 'v', 'm', 'S')", "('r', 'p', 'v', 'm', 's')"),
);
