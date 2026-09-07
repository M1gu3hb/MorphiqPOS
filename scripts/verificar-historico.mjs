#!/usr/bin/env node
/**
 * Verifica el contrato de historico/ (F1.0-T02).
 *
 *   historico/ es EVIDENCIA, no codigo:
 *   no se compila, no se lintea, no se importa, no se escanea, no se versiona.
 *
 * El script crece con el repositorio: las comprobaciones condicionales se
 * activan solas cuando aparecen tsconfig.base.json y la configuracion de lint.
 * Asi la regla no se puede romper mas adelante sin que esta prueba lo diga.
 *
 * Se ejecuta con: pnpm verify:historico
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';

const RAIZ = process.cwd();
const HISTORICO = join(RAIZ, 'historico');

/** Las tres fuentes y un archivo marcador que prueba que estan completas. */
const FUENTES = [
  { ruta: 'historico/tiendita', marcador: 'package.json', que: 'Repo POS-MH-Tiendita (Fuente B)' },
  { ruta: 'historico/restaurante', marcador: 'base44/config.jsonc', que: 'ZIP POS MH Restaurante (Fuente A)' },
  { ruta: 'historico/auditoria-fase-0', marcador: 'LEEME_PRIMERO.md', que: 'Paquete de auditoria de Fase 0' },
];

/** Carpetas del monorepo que SI son codigo y no pueden importar de historico/. */
const CODIGO = ['apps', 'packages', 'capabilities', 'scripts', 'infra'];

const fallos = [];
const avisos = [];

function comprobar(condicion, mensaje) {
  if (!condicion) fallos.push(mensaje);
}

// 1 · Las fuentes existen y estan completas
for (const fuente of FUENTES) {
  const marcador = join(RAIZ, fuente.ruta, fuente.marcador);
  comprobar(
    existsSync(marcador),
    `${fuente.que}: falta ${fuente.ruta}/${fuente.marcador}. ` +
      `Repuéblala siguiendo historico/README.md`,
  );
}

// 2 · historico/ ignorada por git, salvo su README
try {
  execFileSync('git', ['check-ignore', '-q', 'historico/tiendita/package.json'], {
    cwd: RAIZ,
    stdio: 'ignore',
  });
} catch {
  fallos.push('historico/ NO esta ignorada por git');
}
try {
  execFileSync('git', ['check-ignore', '-q', 'historico/README.md'], {
    cwd: RAIZ,
    stdio: 'ignore',
  });
  fallos.push('historico/README.md NO debe estar ignorado: documenta las reglas de la carpeta');
} catch {
  /* correcto: el README si se versiona */
}

// 3 · historico/ no es un workspace de pnpm
try {
  const salida = execSync('pnpm ls --recursive --depth -1 --parseable', {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const enHistorico = salida
    .split(/\r?\n/)
    .filter((linea) => linea.trim().length > 0)
    .filter((linea) => relative(RAIZ, linea).split(sep)[0] === 'historico');
  comprobar(
    enHistorico.length === 0,
    `pnpm trata como workspace ${enHistorico.length} carpeta(s) de historico/: ${enHistorico.join(', ')}`,
  );
} catch (error) {
  fallos.push(`No se pudo consultar los workspaces de pnpm: ${error.message}`);
}

// 4 · tsconfig.base.json excluye historico  (se activa cuando exista — F1.0-T03)
const rutaTsconfig = join(RAIZ, 'tsconfig.base.json');
if (existsSync(rutaTsconfig)) {
  const texto = readFileSync(rutaTsconfig, 'utf8');
  comprobar(/historico/.test(texto), 'tsconfig.base.json no excluye historico/');
} else {
  avisos.push('tsconfig.base.json todavia no existe (llega en F1.0-T03)');
}

// 5 · La configuracion de lint ignora historico  (se activa cuando exista — F1.0-T09)
const CONFIGS_LINT = ['eslint.config.mjs', 'eslint.config.js', 'biome.json', 'biome.jsonc'];
const configLint = CONFIGS_LINT.find((nombre) => existsSync(join(RAIZ, nombre)));
if (configLint) {
  const texto = readFileSync(join(RAIZ, configLint), 'utf8');
  comprobar(/historico/.test(texto), `${configLint} no ignora historico/`);
} else {
  avisos.push('La configuracion de lint todavia no existe (llega en F1.0-T09)');
}

// 6 · Ningun archivo de codigo importa desde historico/
const EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const IMPORTA_HISTORICO = /(?:from|import|require)\s*\(?\s*['"][^'"]*historico\//;

function recorrer(dir, encontrados) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === '.git') continue;
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      recorrer(ruta, encontrados);
      continue;
    }
    const punto = entrada.name.lastIndexOf('.');
    if (punto === -1 || !EXT.has(entrada.name.slice(punto))) continue;
    if (IMPORTA_HISTORICO.test(readFileSync(ruta, 'utf8'))) {
      encontrados.push(relative(RAIZ, ruta));
    }
  }
}

const importadores = [];
for (const carpeta of CODIGO) {
  const ruta = join(RAIZ, carpeta);
  if (existsSync(ruta)) recorrer(ruta, importadores);
}
comprobar(
  importadores.length === 0,
  `Hay codigo que importa desde historico/: ${importadores.join(', ')}`,
);

// 7 · historico/ no contiene nada mas que las tres fuentes y el README
if (existsSync(HISTORICO)) {
  const permitidos = new Set(['README.md', ...FUENTES.map((f) => f.ruta.split('/')[1])]);
  const sobrantes = readdirSync(HISTORICO).filter((n) => !permitidos.has(n));
  comprobar(
    sobrantes.length === 0,
    `historico/ contiene entradas no declaradas: ${sobrantes.join(', ')}. ` +
      'Toda fuente debe declararse en historico/README.md',
  );
}

for (const aviso of avisos) console.log(`  · pendiente: ${aviso}`);

if (fallos.length > 0) {
  console.error('\n✗ El contrato de historico/ no se cumple:\n');
  for (const fallo of fallos) console.error(`  · ${fallo}`);
  console.error(`\n${fallos.length} fallo(s).`);
  process.exit(1);
}

console.log(`✓ historico/ cumple su contrato: ${FUENTES.length} fuentes, aisladas del monorepo.`);
