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
const CONFIGURACION = join(RAIZ, 'packages', 'app', 'src', 'configuracion', 'configuracion.ts');
const PRUEBA_CONFIGURACION = 'packages/app/src/configuracion/configuracion.test.ts';
const VITEST = join(RAIZ, 'node_modules', 'vitest', 'vitest.mjs');

function exigirCambio(nombre, original, mutado) {
  if (mutado === original) {
    throw new Error(`La mutación "${nombre}" no cambió el archivo objetivo.`);
  }
}

function comprobarMutacion({ nombre, origen, archivoTemporal, variable, prueba, transformar }) {
  const carpeta = mkdtempSync(join(tmpdir(), 'morphiqpos-mutacion-'));
  const archivo = join(carpeta, archivoTemporal);
  const original = readFileSync(origen, 'utf8');
  const mutado = transformar(original);
  exigirCambio(nombre, original, mutado);
  writeFileSync(archivo, mutado, 'utf8');

  try {
    const resultado = spawnSync(
      process.execPath,
      [
        VITEST,
        'run',
        prueba,
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
        env: { ...process.env, [variable]: archivo },
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

comprobarMutacion({
  nombre: 'RLS FORCE eliminado',
  origen: MIGRACION_RLS,
  archivoTemporal: '050_rls_faltante.sql',
  variable: 'MORPHIQPOS_RLS_MIGRATION_PATH',
  prueba: PRUEBA_RLS,
  transformar: (sql) => sql.replaceAll('force row level security', 'disable row level security'),
});
comprobarMutacion({
  nombre: 'secuencias excluidas del REVOKE',
  origen: MIGRACION_RLS,
  archivoTemporal: '050_rls_faltante.sql',
  variable: 'MORPHIQPOS_RLS_MIGRATION_PATH',
  prueba: PRUEBA_RLS,
  transformar: (sql) => sql.replace("('r', 'p', 'v', 'm', 'S')", "('r', 'p', 'v', 'm', 's')"),
});
comprobarMutacion({
  nombre: 'paquete reabierto en configuracion.guardar',
  origen: CONFIGURACION,
  archivoTemporal: 'configuracion.ts',
  variable: 'MORPHIQPOS_CONFIGURACION_SOURCE_PATH',
  prueba: PRUEBA_CONFIGURACION,
  transformar: (codigo) =>
    codigo.replace(
      "  estilo: z.enum(['base', 'editorial', 'premium']),",
      "  estilo: z.enum(['base', 'editorial', 'premium']),\n  paquete: z.enum(PAQUETES),",
    ),
});
comprobarMutacion({
  nombre: 'merge parcial sustituido por replace',
  origen: CONFIGURACION,
  archivoTemporal: 'configuracion.ts',
  variable: 'MORPHIQPOS_CONFIGURACION_SOURCE_PATH',
  prueba: PRUEBA_CONFIGURACION,
  transformar: (codigo) =>
    codigo.replace('      ...(esDocumento(actual?.valores) ? actual.valores : {}),\n', ''),
});
