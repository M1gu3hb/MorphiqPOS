#!/usr/bin/env node
/**
 * PAR-1 · LA FASE 3 EN UN SOLO COMANDO (la laptop de Miguel): migrar la base COMPARTIDA con la
 * 186 y la 187, y comprobar que nadie más cambió. Ver `docs/paridad/PARIDAD-DON-PONCHO.md` §5.
 *
 *   node --conditions=react-server scripts/paridad-laptop.mjs --entorno ..\_PRIVADO\fase-a.env
 *
 * Opciones: `--commit <sha>` (por omisión, el de `origin/paridad/fase-b`), `--salida <carpeta>`
 * (por omisión `..\_PRIVADO\paridad\<fecha>`, fuera del repositorio), `--transporte cli|url` y
 * `--saltar-verificacion` (las dos últimas, sólo para ensayarlo en una base desechable).
 *
 * En orden, y se detiene en el primer problema:
 *   1. El repositorio limpio y en el commit del PR B.
 *   2. El transporte del RUNBOOK §2: `SUPABASE_CLI_PATH` y
 *      `MORPHIQPOS_SUPABASE_PROJECT_REF=wyqmzhliurwyxuyxznpb` (la sesión y el vínculo del CLI).
 *   3. Lo pendiente, con `emitirTanda` del ejecutor: lee el ledger y escribe la tanda en un
 *      archivo temporal; NO la aplica (`db:migrate -- --ensayo` sí aplica: no se usa).
 *   4. Si lo pendiente no es EXACTAMENTE la 186 y la 187, aborta sin tocar nada.
 *   5. La huella de todos los negocios.
 *   6. `pnpm db:migrate`.
 *   7. `pnpm verify:esquema` y `pnpm verify:rls`.
 *   8. La huella otra vez, comparada: sólo puede cambiar el relleno de la 187.
 *   9. Un resumen corto para pegar en el chat. Sin secretos.
 *
 * `DATABASE_URL` (las lecturas: lo pendiente y la huella) sale del entorno o de `--entorno`; el
 * archivo se lee sin imprimir nada de él.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { argumento } from './lib/guion.mjs';
import { tomar, comparar } from './huella-de-negocios.mjs';

const PROYECTO = 'wyqmzhliurwyxuyxznpb';
const ESPERADAS = ['186_pedido_compartido.sql', '187_unir_mesas_desde_el_mapa.sql'];
const CLI_DE_LA_LAPTOP =
  'D:\\herramientas\\supabase-cli\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe';
const RAIZ = process.cwd();
const inicio = Date.now();
const resumen = [];
const paso = (n, texto) => console.log(`\n── ${String(n)} · ${texto}`);
const alto = (texto) => {
  console.error(`\n✗ ${texto}`);
  console.error('  Nada más se hizo. Pega esto en el chat.');
  process.exit(1);
};

function cargarArchivoDeEntorno(ruta) {
  if (ruta === null) return;
  if (!existsSync(ruta)) alto(`No existe el archivo de entorno ${ruta}.`);
  for (const linea of readFileSync(ruta, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)) {
    const par = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(linea);
    if (par !== null) process.env[par[1]] = par[2].replace(/^["']|["']$/g, '');
  }
}

function git(...args) {
  const r = spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  return { ok: r.status === 0, salida: (r.stdout ?? '').trim(), error: (r.stderr ?? '').trim() };
}

/** Git TIENE que contestar: una guarda que pasa porque git falló no guarda nada. */
function gitOAlto(...args) {
  const r = git(...args);
  if (!r.ok) alto(`git ${args.join(' ')} falló: ${r.error || 'sin salida'}`);
  return r.salida;
}

function correr(comando, args, entorno) {
  const r = spawnSync(comando, args, {
    cwd: RAIZ,
    stdio: 'inherit',
    env: entorno,
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

// ── 1 · El repositorio ─────────────────────────────────────────────────────
paso(1, 'El repositorio, limpio y en el commit del PR B');
if (gitOAlto('status', '--porcelain', '--untracked-files=no') !== '') {
  alto('El repositorio tiene cambios sin confirmar. Déjalo limpio (git status) y vuelve a correr.');
}
let esperado = argumento('commit');
if (esperado === null) {
  if (!git('fetch', '--quiet', 'origin', 'paridad/fase-b').ok) {
    alto('No se pudo traer origin/paridad/fase-b. Revisa la red o pasa --commit <sha>.');
  }
  esperado = gitOAlto('rev-parse', 'origin/paridad/fase-b');
}
if (!/^[0-9a-f]{7,40}$/.test(esperado))
  alto(`--commit ${esperado}: tiene que ser un sha (7 a 40).`);
const cabeza = gitOAlto('rev-parse', 'HEAD');
if (!/^[0-9a-f]{40}$/.test(cabeza) || !cabeza.startsWith(esperado)) {
  alto(`HEAD es ${cabeza.slice(0, 9)} y el PR B es ${esperado.slice(0, 9)}: haz checkout de él.`);
}
console.log(`✓ limpio, en ${cabeza.slice(0, 9)}`);
resumen.push(`commit ${cabeza.slice(0, 9)}`);

// ── 2 · El transporte ──────────────────────────────────────────────────────
paso(2, 'El transporte del RUNBOOK §2');
cargarArchivoDeEntorno(argumento('entorno'));
const transporte = argumento('transporte', 'cli');
const url = process.env['DATABASE_URL'] ?? '';
if (url === '') alto('Falta DATABASE_URL (las lecturas). Pásala con --entorno <archivo>.');
const { referenciaDeLaCadena } =
  await import('../packages/data/src/verificacion/consulta-directa.ts');
const { esDeUnProyectoIntocable } = await import('../packages/contracts/src/negocios/index.ts');
if (transporte === 'cli') {
  // Las lecturas (lo pendiente y las huellas) tienen que ser de la MISMA base que migra el CLI:
  // si no, se comprobaría una base y se migraría otra.
  if (referenciaDeLaCadena(url) !== PROYECTO) {
    alto(`DATABASE_URL no es del proyecto ${PROYECTO} (el que migra el CLI). Revisa --entorno.`);
  }
  process.env['MORPHIQPOS_DB_VERIFICACION'] = url;
  process.env['MORPHIQPOS_PROYECTO_VERIFICADO'] = PROYECTO;
  process.env['SUPABASE_CLI_PATH'] ??= existsSync(CLI_DE_LA_LAPTOP) ? CLI_DE_LA_LAPTOP : 'supabase';
  process.env['MORPHIQPOS_SUPABASE_PROJECT_REF'] = PROYECTO;
  const version = spawnSync(process.env['SUPABASE_CLI_PATH'], ['--version'], { encoding: 'utf8' });
  if (version.status !== 0)
    alto(`El CLI de Supabase no responde (${process.env['SUPABASE_CLI_PATH']}).`);
  if (!existsSync(join(RAIZ, 'supabase', '.temp', 'linked-project.json'))) {
    alto(`Falta el vínculo del CLI en este checkout: supabase link --project-ref ${PROYECTO}.`);
  }
  console.log(`✓ CLI ${version.stdout.trim()} vinculado a ${PROYECTO}`);
} else if (transporte === 'url') {
  delete process.env['MORPHIQPOS_SUPABASE_PROJECT_REF'];
  // Decodificada y contra los dos intocables: un `%77yqm…` en el usuario no la esconde.
  if (esDeUnProyectoIntocable(url)) {
    alto('Con --transporte url no se migra la base compartida (ni la de otro cliente).');
  }
  console.log('✓ transporte DATABASE_URL (ensayo en una base desechable)');
} else {
  alto(`--transporte ${transporte}: sólo cli o url.`);
}

// ── 3 y 4 · Lo pendiente, sin aplicar nada ─────────────────────────────────
async function pendientes() {
  const ejecutor = await import('../packages/data/src/migraciones/ejecutor.ts');
  const cliente = await import('../packages/data/src/cliente.ts');
  const archivo = join(tmpdir(), `paridad-pendientes-${String(process.pid)}.sql`);
  try {
    const r = await ejecutor.emitirTanda({ archivo });
    return { lista: r.aplicadas, yaEstaban: r.yaEstaban };
  } finally {
    rmSync(archivo, { force: true });
    await cliente.cerrarDb();
  }
}
paso(3, 'Lo pendiente (sólo lee el ledger)');
const antesDeMigrar = await pendientes();
console.log(
  `  ${String(antesDeMigrar.yaEstaban)} aplicadas; pendientes: ${antesDeMigrar.lista.join(', ') || 'ninguna'}`,
);
paso(4, 'Tienen que ser exactamente la 186 y la 187');
if (JSON.stringify(antesDeMigrar.lista) !== JSON.stringify(ESPERADAS)) {
  alto(
    `Lo pendiente es [${antesDeMigrar.lista.join(', ')}] y debía ser [${ESPERADAS.join(', ')}].`,
  );
}
console.log('✓ exactamente la 186 y la 187');
resumen.push(`ledger en ${String(antesDeMigrar.yaEstaban)}, pendientes 186 y 187`);

// ── 5 · La huella de antes ─────────────────────────────────────────────────
const fecha = new Date().toISOString().replaceAll(':', '').slice(0, 15);
const salida = resolve(argumento('salida', join(RAIZ, '..', '_PRIVADO', 'paridad', fecha)));
mkdirSync(salida, { recursive: true });
paso(5, `La huella de todos los negocios → ${salida}`);
const huellaAntes = await tomar(url, { salida: join(salida, 'huella-antes.json') });

// ── 6 · Migrar ─────────────────────────────────────────────────────────────
paso(6, 'pnpm db:migrate');
if (!correr('pnpm', ['db:migrate'], process.env))
  alto('db:migrate falló. La migración es atómica: revisa el ledger.');
const despuesDeMigrar = await pendientes();
if (despuesDeMigrar.lista.length > 0)
  alto(`Después de migrar siguen pendientes: ${despuesDeMigrar.lista.join(', ')}.`);
console.log(`✓ ledger en ${String(despuesDeMigrar.yaEstaban)}, sin pendientes`);
resumen.push(`migrado: ledger en ${String(despuesDeMigrar.yaEstaban)}`);

// ── 7 · Las puertas ────────────────────────────────────────────────────────
paso(7, 'verify:esquema y verify:rls');
if (process.argv.includes('--saltar-verificacion')) {
  console.log('  (saltadas: ensayo en una base desechable, sin proyecto de Supabase)');
  resumen.push('verify: saltadas (ensayo)');
} else {
  const esquema = correr('pnpm', ['verify:esquema'], process.env);
  const rls = correr('pnpm', ['verify:rls'], process.env);
  resumen.push(
    `verify:esquema ${esquema ? 'verde' : 'ROJO'}, verify:rls ${rls ? 'verde' : 'ROJO'}`,
  );
  if (!esquema || !rls)
    alto('Una puerta salió roja (arriba dice cuál). La migración ya está aplicada.');
}

// ── 8 · La huella de después ───────────────────────────────────────────────
paso(8, 'La huella otra vez, comparada');
const huellaDespues = await tomar(url, {
  salida: join(salida, 'huella-despues.json'),
  como: huellaAntes,
});
const r = comparar(huellaAntes, huellaDespues);
if (r.diferencias.length > 0) {
  resumen.push(`huella DISTINTA: ${r.diferencias.slice(0, 3).join('; ')}`);
} else {
  resumen.push(
    `huella de ${String(huellaAntes.organizaciones.length)} negocios IDÉNTICA salvo el relleno de la 187 ` +
      `(${String(r.relleno)} mesas en ${String(r.uniones)} uniones abiertas); nuevas vacías: ${r.nuevas.join(', ')}`,
  );
}

// ── 9 · El resumen ─────────────────────────────────────────────────────────
const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
console.log(
  `\n══ PAR-1 · fase 3 · ${r.diferencias.length === 0 ? 'TODO EN VERDE' : 'REVISAR'} (${segundos} s)`,
);
for (const linea of resumen) console.log(`· ${linea}`);
console.log(`· huellas en ${dirname(join(salida, 'x'))} (fuera del repositorio)`);
if (r.diferencias.length > 0) process.exit(1);
