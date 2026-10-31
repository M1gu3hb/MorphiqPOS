#!/usr/bin/env node
/**
 * PAR-1 · LA FASE 3 EN UN SOLO COMANDO (la laptop de Miguel): migrar la base COMPARTIDA con la
 * 186 y la 187, y comprobar que nadie más cambió. Ver `docs/paridad/PARIDAD-DON-PONCHO.md` §5.
 *
 *   node --conditions=react-server scripts/paridad-laptop.mjs --entorno ..\_PRIVADO\fase-a.env
 *
 * Opciones:
 *   --commit <sha>        por omisión, el de `origin/paridad/fase-b`.
 *   --salida <carpeta>    por omisión `..\_PRIVADO\paridad\<fecha>`, fuera del repositorio.
 *   --reanudar <carpeta>  si la 186 y la 187 YA se aplicaron (el guion se cortó después de
 *                         migrar): salta a las puertas y a la huella de después, contra la
 *                         `huella-antes.json` de esa carpeta.
 *   --transporte cli|url  y `--saltar-verificacion`: `url` es sólo para ensayarlo en una base
 *                         desechable, y entonces las puertas (que son de Supabase) se saltan.
 *
 * En orden, y se detiene en el primer problema:
 *   1. El repositorio limpio y en el commit del PR B.
 *   2. El transporte del RUNBOOK §2: `SUPABASE_CLI_PATH` y
 *      `MORPHIQPOS_SUPABASE_PROJECT_REF=wyqmzhliurwyxuyxznpb` (la sesión y el vínculo del CLI).
 *   3. Lo pendiente, con `emitirTanda` del ejecutor: lee el ledger y escribe la tanda en un
 *      archivo temporal; NO la aplica (`db:migrate -- --ensayo` sí aplica: no se usa).
 *   4. La 186 y la 187 del disco son las de Don Poncho byte por byte (su hash), y lo pendiente es
 *      EXACTAMENTE la 186 y la 187. Si no, aborta sin tocar nada.
 *   5. La huella de todos los negocios.
 *   6. `pnpm db:migrate`.
 *   7. `pnpm verify:esquema` y `pnpm verify:rls`. Si una sale roja, igual se toma la huella.
 *   8. La huella otra vez, comparada: sólo puede cambiar el relleno de la 187.
 *   9. Un resumen corto para pegar en el chat. Sin secretos.
 *
 * `DATABASE_URL` (las lecturas: lo pendiente y la huella) sale del entorno o de `--entorno`; el
 * archivo se lee sin imprimir nada de él.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { argumento, cargarArchivoDeEntorno } from './lib/guion.mjs';
import { comparar, deQueBase, tomar } from './huella-de-negocios.mjs';

const PROYECTO = 'wyqmzhliurwyxuyxznpb';
/**
 * Las dos migraciones, con el hash que les da el ejecutor (el mismo en el maestro y en Don
 * Poncho). Si el archivo cambió aunque sea un espacio, no se aplica: el ledger compartido
 * guardaría otro hash y el `db:migrate` de Don Poncho se negaría para siempre. Una corrección va en
 * una migración NUEVA (189 en adelante).
 */
const ESPERADAS = [
  { archivo: '186_pedido_compartido.sql', hash: '87b4fddc36c87efa' },
  { archivo: '187_unir_mesas_desde_el_mapa.sql', hash: '280af1ec0f6a38af' },
];
const NOMBRES = ESPERADAS.map((e) => e.archivo);
const CLI_DE_LA_LAPTOP =
  'D:\\herramientas\\supabase-cli\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe';
const RAIZ = process.cwd();
const inicio = Date.now();
const resumen = [];
const paso = (n, texto) => console.log(`\n── ${String(n)} · ${texto}`);
/**
 * ¿La 186 y la 187 ya están en la base? `intacta`, `migrada`, o `desconocida` (el `db:migrate`
 * corrió y no se pudo releer el ledger). Cambia lo que se le dice a Miguel si algo falla.
 */
let base = 'intacta';
let salida = null;
const alto = (texto) => {
  console.error(`\n✗ ${texto}`);
  if (base === 'desconocida') {
    console.error(
      '  No se sabe si la 186 y la 187 entraron (la tanda es atómica: o las dos o ninguna). ' +
        'No fusiones nada. Corre otra vez el guion: el paso 3 lo dice.',
    );
    if (salida !== null) console.error(`  Si ya entraron, va con --reanudar "${salida}".`);
    console.error('  Pega esto en el chat.');
  } else if (base === 'migrada') {
    console.error('  OJO: la base YA tiene la 186 y la 187 (no se deshacen). No fusiones nada.');
    if (salida !== null && existsSync(join(salida, 'huella-antes.json'))) {
      console.error(
        `  Para terminar la verificación: el mismo comando con --reanudar "${salida}".`,
      );
    }
    console.error('  Pega esto en el chat.');
  } else {
    console.error('  Nada más se hizo: la base quedó como estaba. Pega esto en el chat.');
  }
  process.exit(1);
};
const mismaLista = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  alto(
    `HEAD es ${cabeza.slice(0, 9)} y el PR B es ${esperado.slice(0, 9)}: ` +
      'git pull (o git checkout de ese commit) y vuelve a correr.',
  );
}
console.log(`✓ limpio, en ${cabeza.slice(0, 9)}`);
resumen.push(`commit ${cabeza.slice(0, 9)}`);

// ── 2 · El transporte ──────────────────────────────────────────────────────
paso(2, 'El transporte del RUNBOOK §2');
const entorno = argumento('entorno');
if (entorno !== null) {
  try {
    cargarArchivoDeEntorno(entorno);
  } catch (e) {
    alto(e instanceof Error ? e.message : String(e));
  }
}
const transporte = argumento('transporte', 'cli');
const saltarVerificacion = process.argv.includes('--saltar-verificacion');
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
  const cli = process.env['SUPABASE_CLI_PATH'];
  const version = spawnSync(cli, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) {
    alto(
      `El CLI de Supabase no responde (${cli}). En PowerShell: ` +
        `$env:SUPABASE_CLI_PATH = '${CLI_DE_LA_LAPTOP}'`,
    );
  }
  const vinculo = join(RAIZ, 'supabase', '.temp', 'linked-project.json');
  if (!existsSync(vinculo)) {
    alto(`Falta el vínculo del CLI en este checkout: & '${cli}' link --project-ref ${PROYECTO}`);
  }
  let vinculado;
  try {
    vinculado = JSON.parse(readFileSync(vinculo, 'utf8'))?.ref ?? null;
  } catch {
    vinculado = null;
  }
  if (vinculado !== PROYECTO) {
    alto(
      `El vínculo del CLI es de ${String(vinculado)}, no de ${PROYECTO}: ` +
        `& '${cli}' link --project-ref ${PROYECTO}`,
    );
  }
  console.log(`✓ CLI ${version.stdout.trim()} vinculado a ${PROYECTO}`);
} else if (transporte === 'url') {
  // Cadena VACÍA y no `delete`: el `db:migrate` hijo carga el `.env` de la raíz con dotenv, que
  // no pisa una variable definida pero sí recarga una borrada; el `.env` de la laptop trae el
  // proyecto compartido y el ensayo habría migrado PRODUCCIÓN por el CLI (probado con un CLI
  // trampa). `''` es como lo apagan `demo-local.mjs` y `ensayar-restauracion.mjs`.
  process.env['MORPHIQPOS_SUPABASE_PROJECT_REF'] = '';
  process.env['SUPABASE_CLI_PATH'] = '';
  process.env['MORPHIQPOS_DB_VERIFICACION'] = url;
  // Decodificada y contra los dos intocables: un `%77yqm…` en el usuario no la esconde.
  if (esDeUnProyectoIntocable(url)) {
    alto('Con --transporte url no se migra la base compartida (ni la de otro cliente).');
  }
  if (!saltarVerificacion) {
    alto(
      'Con --transporte url las puertas (verify:esquema y verify:rls) no aplican: hablan con ' +
        'Supabase. Agrega --saltar-verificacion.',
    );
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
const reanudar = argumento('reanudar');
let huellaAntes = null;
let r = null;
let puertas = 'sin correr';
try {
  paso(3, 'Lo pendiente (sólo lee el ledger)');
  const antesDeMigrar = await pendientes();
  console.log(
    `  ${String(antesDeMigrar.yaEstaban)} aplicadas; pendientes: ${antesDeMigrar.lista.join(', ') || 'ninguna'}`,
  );

  paso(4, 'La 186 y la 187: las de Don Poncho, y exactamente lo pendiente');
  const { leerMigraciones } = await import('../packages/data/src/migraciones/lectura.ts');
  const enDisco = new Map(leerMigraciones().map((m) => [m.archivo, m.hash]));
  for (const e of ESPERADAS) {
    const hash = enDisco.get(e.archivo);
    if (hash !== e.hash) {
      alto(
        `${e.archivo} no es la de Don Poncho byte por byte (hash ${hash ?? 'ausente'}, debía ser ` +
          `${e.hash}). No se migra: una corrección va en una migración nueva (189+).`,
      );
    }
  }
  console.log('✓ la 186 y la 187 del disco son las de Don Poncho (mismo hash)');
  if (reanudar === null) {
    if (!mismaLista(antesDeMigrar.lista, NOMBRES)) {
      // Sin pendientes (y el disco ya verificado): la base YA las tiene; que el pie lo diga.
      if (antesDeMigrar.lista.length === 0) base = 'migrada';
      alto(
        `Lo pendiente es [${antesDeMigrar.lista.join(', ')}] y debía ser [${NOMBRES.join(', ')}].` +
          (antesDeMigrar.lista.length === 0
            ? ' Si el guion ya migró y se cortó, corre otra vez con --reanudar <carpeta>.'
            : ''),
      );
    }
    console.log('✓ exactamente la 186 y la 187');
    resumen.push(`ledger en ${String(antesDeMigrar.yaEstaban)}, pendientes 186 y 187`);
  } else {
    // Sin pendientes y con el disco verificado: `comprobarIntegridad` (dentro de `emitirTanda`)
    // ya exigió que el ledger guarde el MISMO hash de cada archivo aplicado.
    if (antesDeMigrar.lista.length > 0) {
      alto(
        `--reanudar es para cuando la 186 y la 187 ya se aplicaron, y siguen pendientes: ` +
          `[${antesDeMigrar.lista.join(', ')}]. Corre sin --reanudar.`,
      );
    }
    base = 'migrada';
    salida = resolve(reanudar);
    if (!existsSync(join(salida, 'huella-antes.json'))) {
      alto(
        `No está ${join(salida, 'huella-antes.json')}: --reanudar va con la carpeta de la corrida.`,
      );
    }
    huellaAntes = JSON.parse(readFileSync(join(salida, 'huella-antes.json'), 'utf8'));
    if (huellaAntes.base !== undefined && huellaAntes.base !== deQueBase(url)) {
      salida = null; // esa carpeta es de otra base: no se sugiere reanudar con ella
      alto(
        `La huella de antes se tomó en ${String(huellaAntes.base)} y esta corrida lee ${deQueBase(url)}.`,
      );
    }
    console.log(`✓ reanudando: ledger en ${String(antesDeMigrar.yaEstaban)}, sin pendientes`);
    resumen.push(`reanudada: ledger en ${String(antesDeMigrar.yaEstaban)}`);
  }

  if (reanudar === null) {
    // ── 5 · La huella de antes ─────────────────────────────────────────────
    const fecha = new Date().toISOString().replaceAll(':', '').slice(0, 15);
    salida = resolve(argumento('salida', join(RAIZ, '..', '_PRIVADO', 'paridad', fecha)));
    mkdirSync(salida, { recursive: true });
    paso(5, `La huella de todos los negocios → ${salida}`);
    huellaAntes = await tomar(url, { salida: join(salida, 'huella-antes.json') });

    // ── 6 · Migrar ─────────────────────────────────────────────────────────
    paso(6, 'pnpm db:migrate');
    base = 'desconocida';
    const migro = correr('pnpm', ['db:migrate'], process.env);
    const despuesDeMigrar = await pendientes();
    if (despuesDeMigrar.lista.length > 0) {
      base = 'intacta';
      alto(
        `db:migrate ${migro ? 'terminó' : 'falló'} y siguen pendientes: ` +
          `${despuesDeMigrar.lista.join(', ')} (ledger en ${String(despuesDeMigrar.yaEstaban)}). ` +
          'La tanda es atómica: no entró ninguna.',
      );
    }
    base = 'migrada';
    if (!migro) {
      // El CLI salió con error pero el ledger ya las tiene (se cortó la respuesta): se sigue.
      console.log(
        '  db:migrate salió con error, pero el ledger ya tiene la 186 y la 187: se sigue.',
      );
    }
    console.log(`✓ ledger en ${String(despuesDeMigrar.yaEstaban)}, sin pendientes`);
    resumen.push(`migrado: ledger en ${String(despuesDeMigrar.yaEstaban)}`);
  }

  // ── 7 · Las puertas ──────────────────────────────────────────────────────
  paso(7, 'verify:esquema y verify:rls');
  if (saltarVerificacion) {
    console.log('  (saltadas: ensayo en una base desechable, sin proyecto de Supabase)');
    puertas = 'saltadas';
    resumen.push('verify: saltadas (ensayo)');
  } else {
    const esquema = correr('pnpm', ['verify:esquema'], process.env);
    const rls = correr('pnpm', ['verify:rls'], process.env);
    puertas = esquema && rls ? 'verdes' : 'ROJAS';
    resumen.push(
      `verify:esquema ${esquema ? 'verde' : 'ROJO'}, verify:rls ${rls ? 'verde' : 'ROJO'}`,
    );
    // Roja o no, se toma la huella de después: es la prueba de que nadie más cambió.
  }

  // ── 8 · La huella de después ─────────────────────────────────────────────
  paso(8, 'La huella otra vez, comparada');
  const huellaDespues = await tomar(url, {
    salida: join(salida, 'huella-despues.json'),
    como: huellaAntes,
  });
  r = comparar(huellaAntes, huellaDespues);
  if (r.diferencias.length > 0) {
    resumen.push(`huella DISTINTA: ${r.diferencias.slice(0, 5).join('; ')}`);
  } else {
    resumen.push(
      `huella de ${String(huellaAntes.organizaciones.length)} negocios IDÉNTICA salvo el relleno de la 187 ` +
        `(${String(r.relleno)} mesas en ${String(r.uniones)} uniones abiertas); nuevas vacías: ${r.nuevas.join(', ')}`,
    );
  }
} catch (e) {
  // Una red caída, el pooler que corta, un ledger que no cuadra: con el estado de la base dicho.
  alto(`Se cortó: ${e instanceof Error ? e.message : String(e)}`);
}

// ── 9 · El resumen ─────────────────────────────────────────────────────────
const verde = r !== null && r.diferencias.length === 0 && puertas !== 'ROJAS';
const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
console.log(`\n══ PAR-1 · fase 3 · ${verde ? 'TODO EN VERDE' : 'REVISAR'} (${segundos} s)`);
for (const linea of resumen) console.log(`· ${linea}`);
console.log(`· huellas en ${String(salida)} (fuera del repositorio)`);
if (!verde) {
  console.log('· La base YA tiene la 186 y la 187. NO fusiones el PR B hasta revisarlo.');
  if (r !== null && r.diferencias.length > 0) {
    console.log(
      '· Si lo distinto es de un negocio que estaba atendiendo (ordenes, pagos, sesiones, ' +
        'auditoria), puede ser su tráfico y no la migración: se revisa con el detalle de arriba.',
    );
  }
  process.exit(1);
}
