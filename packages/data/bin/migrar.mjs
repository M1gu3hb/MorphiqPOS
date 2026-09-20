#!/usr/bin/env node
/**
 * Punto de entrada de `pnpm db:migrate`.
 *
 * Lee DATABASE_URL del entorno y aplica lo que falte. Cuando la contraseña del
 * Postgres gestionado no está disponible, un project ref explícito permite usar
 * la conexión vinculada del CLI de Supabase sin cambiar el protocolo del ledger.
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

/**
 * `--emitir <archivo>` escribe la tanda y NO la aplica.
 *
 * ── Por qué existe este tercer camino ──────────────────────────────────────
 * Los dos transportes del ejecutor necesitan una credencial que esta máquina no
 * tiene: `migrar()` pide una `DATABASE_URL` con DDL —y `morphiqpos_app` no lo
 * tiene a propósito— y `migrarVinculado()` pide el ejecutable del CLI de
 * Supabase. Sin uno de los dos, las 70 migraciones no se pueden aplicar, y ése
 * es el corazón del acople.
 *
 * Lo que sale por aquí es EXACTAMENTE el mismo texto que aplicaría
 * `migrarVinculado`: la misma función, `prepararTandaVinculada`, con su
 * `begin`, sus `insert` de ledger con el hash de cada archivo, y su `commit`.
 * El ledger se lee antes y se compara con la MISMA `comprobarIntegridad`, así
 * que una migración editada después de aplicarse aborta aquí igual que allí.
 *
 * ── Lo que este camino NO da, y hay que decirlo ────────────────────────────
 * Que emitir y aplicar ocurran en la misma conexión. Entre las dos cosas
 * alguien podría aplicar otra migración, y este archivo no se enteraría. Se
 * comprueba DESPUÉS releyendo el ledger contra el disco, que es justo lo que
 * hace `verify:acople`.
 *
 * La atomicidad NO se pierde: el `begin`/`commit` viaja dentro del texto, así
 * que quien lo ejecute lo ejecuta entero o no ejecuta nada.
 */
const indiceEmitir = process.argv.indexOf('--emitir');
const emitir = indiceEmitir === -1 ? undefined : process.argv[indiceEmitir + 1];
const projectRef = process.env['MORPHIQPOS_SUPABASE_PROJECT_REF'];
const cliPath = process.env['SUPABASE_CLI_PATH'];

const ejecutor = await import('../src/migraciones/ejecutor.ts');
let cerrar = () => Promise.resolve();

try {
  let resultado;
  if (emitir !== undefined) {
    resultado = await ejecutor.emitirTanda({ archivo: emitir, ensayo });
  } else if (projectRef !== undefined && projectRef.length > 0) {
    console.log(`  proyecto Supabase vinculado "${projectRef}"`);
    resultado = await ejecutor.migrarVinculado({ projectRef, cliPath, ensayo });
  } else {
    const cliente = await import('../src/cliente.ts');
    cerrar = cliente.cerrarDb;
    const conexion = await cliente.comprobarConexion();
    const motor = /PostgreSQL (\S+)/.exec(conexion.version)?.[1] ?? '?';
    console.log(`  base "${conexion.base}" · PostgreSQL ${motor}`);

    resultado = await ejecutor.migrar({ ensayo });
  }

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
  await cerrar();
}
