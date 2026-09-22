#!/usr/bin/env node
/**
 * LAS PUERTAS DE UNA SOLA PANTALLA, mientras se recompone.
 *
 *   node scripts/comprobar-pantalla.mjs apps/web/src/cafeteria/Cobrar.tsx
 *
 * Formato, adopción, tokens, vocabulario, tipos y lint, filtrados a ESE archivo: con
 * varias pantallas recomponiéndose a la vez, el estado a medias de otra no debe poner
 * en rojo ésta. Los tipos y el lint cargan el programa entero de TypeScript —un
 * gigabyte y medio cada vez—, así que van por TURNO: un candado en disco hace que dos
 * comprobaciones no los corran a la vez y se coman la memoria de la máquina.
 *
 * Sale en 1 si cualquiera de las seis encuentra algo en el archivo.
 *
 * `--rapido` corre sólo las cuatro que tardan segundos —formato, adopción, tokens y
 * vocabulario— para iterar; los tipos y el lint se corren al final, sin `--rapido`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const rapido = process.argv.includes('--rapido');
const archivo = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (archivo === undefined) {
  console.error('Uso: node scripts/comprobar-pantalla.mjs <ruta de la pantalla>');
  process.exit(2);
}
const absoluto = resolve(RAIZ, archivo);
const relativo = relative(RAIZ, absoluto).split(sep).join('/');
const pantalla = relativo.replace(/^apps\/web\/src\//, '').replace(/\.tsx$/, '');
/**
 * Las herramientas se lanzan con `node` y su archivo de entrada, NUNCA por el shell:
 * en Windows `.bin/tsc` es un `.cmd` que sólo corre con `shell: true`, y el shell
 * parte la ruta del repositorio por el espacio de «MIS PROYECTOS». La primera versión
 * de este script lanzaba así los tipos y el lint: no arrancaban, no escribían ninguna
 * línea del archivo, y el filtro lo leía como «sin errores». Verde sin haber corrido.
 */
const HERRAMIENTAS = {
  tsc: join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc'),
  eslint: join(RAIZ, 'node_modules', 'eslint', 'bin', 'eslint.js'),
  prettier: join(RAIZ, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
};
const CANDADO = join(RAIZ, 'node_modules', '.cache', 'comprobar-pantalla.candado');

function correr(comando, argumentos) {
  const r = spawnSync(process.execPath, [comando, ...argumentos], {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // Que no arranque es un FALLO, no un silencio: sin esto, «no hay líneas de este
  // archivo» se confunde con «no hay errores».
  if (r.error !== undefined) throw r.error;
  return { codigo: r.status ?? 1, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Sólo las líneas que hablan de ESTE archivo (con barras de un lado o del otro). */
function delArchivo(texto) {
  const variantes = [relativo, relativo.split('/').join('\\')];
  return texto.split('\n').filter((l) => variantes.some((v) => l.includes(v)));
}

const fallos = [];

// 1 · formato: se ESCRIBE, no se comprueba. Es la única que arregla sola.
correr(HERRAMIENTAS.prettier, ['--write', absoluto]);

// 2 · adopción
const adopcion = correr(join(RAIZ, 'scripts', 'verificar-adopcion.mjs'), [
  '--detalle',
  '--solo',
  pantalla,
]);
if (adopcion.codigo !== 0)
  fallos.push([
    'adopción',
    adopcion.salida.split('\n').filter((l) => /^\s+(:\d+\s+)?1\.\d|NO /.test(l)),
  ]);

// 3 · tokens y 4 · vocabulario: corren sobre todo, se leen sólo de aquí
for (const [nombre, script] of [
  ['tokens', 'scripts/verificar-primitivas.mjs'],
  ['vocabulario', 'scripts/traducir-vocabulario.mjs'],
]) {
  const r = correr(join(RAIZ, script), script.endsWith('vocabulario.mjs') ? ['--verificar'] : []);
  const propias = delArchivo(r.salida);
  if (propias.length > 0) fallos.push([nombre, propias]);
}

// 5 · tipos y 6 · lint, POR TURNO
if (rapido) {
  for (const [nombre, lineas] of fallos) {
    console.log(`✗ ${nombre}`);
    for (const l of lineas.slice(0, 40)) console.log(`  ${l.trim()}`);
  }
  if (fallos.length > 0) process.exit(1);
  console.log(
    `✓ ${pantalla} (rápido): formato, adopción, tokens y vocabulario. Faltan tipos y lint.`,
  );
  process.exit(0);
}
const inicio = Date.now();
// La carpeta del candado tiene que existir: sin ella `mkdirSync` falla SIEMPRE, y
// un fallo siempre se lee como «ocupado» y se espera para siempre.
mkdirSync(dirname(CANDADO), { recursive: true });
for (;;) {
  try {
    mkdirSync(CANDADO, { recursive: false });
    break;
  } catch {
    // Un candado de más de diez minutos es de una comprobación que murió: se retira.
    if (existsSync(CANDADO) && Date.now() - statSync(CANDADO).mtimeMs > 600_000)
      rmSync(CANDADO, { recursive: true, force: true });
    if (Date.now() - inicio > 1_800_000) {
      console.error('✗ Media hora esperando turno para los tipos: hay un candado atascado.');
      process.exit(1);
    }
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},3000)']);
  }
}
try {
  const tipos = correr(HERRAMIENTAS.tsc, [
    '--noEmit',
    '-p',
    'apps/web/tsconfig.json',
    '--incremental',
    '--tsBuildInfoFile',
    'node_modules/.cache/tsc-pantallas.tsbuildinfo',
  ]);
  const propios = delArchivo(tipos.salida);
  if (propios.length > 0) fallos.push(['tipos', propios]);
  // tsc sale en 0 (limpio) o en 2 (errores, de éste u otro archivo). Cualquier otra
  // cosa es que no corrió, y eso no puede leerse como verde.
  if (tipos.codigo !== 0 && tipos.codigo !== 2) {
    fallos.push(['tipos', ['tsc no corrió:', ...tipos.salida.split('\n').slice(0, 5)]]);
  }
  const lint = correr(HERRAMIENTAS.eslint, [absoluto]);
  if (lint.codigo !== 0) {
    fallos.push(['lint', lint.salida.split('\n').filter((l) => l.trim() !== '')]);
  }
} finally {
  rmSync(CANDADO, { recursive: true, force: true });
}

if (fallos.length === 0) {
  console.log(`✓ ${pantalla}: formato, adopción, tokens, vocabulario, tipos y lint.`);
  process.exit(0);
}
for (const [nombre, lineas] of fallos) {
  console.log(`✗ ${nombre}`);
  for (const l of lineas.slice(0, 40)) console.log(`  ${l.trim()}`);
}
process.exit(1);
