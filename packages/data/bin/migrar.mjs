#!/usr/bin/env node
/**
 * Punto de entrada de `pnpm db:migrate`.
 *
 * Lee DATABASE_URL del entorno y aplica lo que falte. No decide contra qué base
 * corre: eso lo dice la variable, y por eso la MISMA orden sirve para Supabase y
 * para el Postgres del compose. Esa es la propiedad que protege A-27.
 *
 *   node bin/migrar.mjs            aplica
 *   node bin/migrar.mjs --ensayo   aplica y revierte, para validar el SQL
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

/**
 * El `.env` vive en la RAÍZ del monorepo, no junto a cada paquete.
 *
 * Cargarlo por ruta relativa al cwd hacía que `pnpm -r db:tipos` no lo
 * encontrara: turbo ejecuta el script con el cwd en `packages/data` y desde
 * ahí `.env` no existe. El síntoma era «Falta DATABASE_URL» con la variable
 * perfectamente puesta, que es de los errores que más tiempo hacen perder.
 */
config({
  path: [
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env.local'),
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env'),
    '.env.local',
    '.env',
  ],
  quiet: true,
});

const ensayo = process.argv.includes('--ensayo');

const { migrar } = await import('../src/migraciones/ejecutor.ts');
const { comprobarConexion, cerrarDb } = await import('../src/cliente.ts');

try {
  const conexion = await comprobarConexion();
  const motor = /PostgreSQL (\S+)/.exec(conexion.version)?.[1] ?? '?';
  console.log(`  base "${conexion.base}" · PostgreSQL ${motor}`);

  const resultado = await migrar({ ensayo });

  if (resultado.aplicadas.length === 0) {
    console.log(`✓ Sin migraciones pendientes (${resultado.yaEstaban} ya aplicadas).`);
  } else if (ensayo) {
    console.log(
      `✓ Ensayo correcto: ${resultado.aplicadas.length} migración(es) válidas, revertidas.`,
    );
    for (const archivo of resultado.aplicadas) console.log(`    ${archivo}`);
  } else {
    console.log(`✓ Aplicadas ${resultado.aplicadas.length}:`);
    for (const archivo of resultado.aplicadas) console.log(`    ${archivo}`);
  }
} catch (error) {
  console.error('\n✗ La migración falló. La base quedó como estaba.\n');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await cerrarDb();
}
