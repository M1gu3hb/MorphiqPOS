#!/usr/bin/env node
/**
 * Verifica la estructura del monorepo definida en
 * docs/fase-1/04-ARQUITECTURA-Y-MONOREPO.md §1.
 *
 * Criterio de aceptacion de F1.0-T01:
 *   - la estructura de carpetas existe
 *   - los manifiestos raiz existen y estan bien formados
 *   - historico/ esta ignorado por git y fuera de los workspaces
 *
 * Se ejecuta con: pnpm verify:estructura
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const RAIZ = process.cwd();

/**
 * Carpetas que deben existir HOY, con contenido real.
 *
 * `04-ARQUITECTURA §1` describe la estructura completa del monorepo, pero una
 * carpeta vacia con un .gitkeep no es estructura: es andamiaje que aparenta
 * avance donde no hay nada. La auditoria de F1.0 las conto como ruido y F1.1-T00
 * las retiro.
 *
 * Cada carpeta diferida vuelve cuando el corte que la llena la necesite:
 *   apps/worker         F1.3 · jobs, outbox y reconciliadores
 *   capabilities/       F1.5 · registry completo con grafo de dependencias
 *   packages/app        cuando haya un SEGUNDO consumidor de los comandos.
 *                       Hasta entonces viven en apps/web (A-41: se difiere lo
 *                       que se puede agregar despues sin reescribir lo anterior)
 *   packages/registry   F1.5
 *   infra/ci            el workflow vive en .github/workflows
 */
const CARPETAS = [
  'apps',
  'apps/web',
  'packages',
  'packages/contracts',
  'packages/domain',
  'packages/data',
  // Los casos de uso (A-21). La trae F1.1-A-01 con el envoltorio `comando()`.
  'packages/app',
  'packages/ui',
  'packages/testing',
  'infra',
  'infra/docker',
  'docs',
  'docs/adr',
  'historico',
  'scripts',
];

/** Manifiestos que deben existir en la raiz. */
const ARCHIVOS_RAIZ = [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.gitignore',
  '.npmrc',
  '.gitattributes',
];

const fallos = [];

function comprobar(condicion, mensaje) {
  if (!condicion) fallos.push(mensaje);
}

// 1 · Carpetas
for (const carpeta of CARPETAS) {
  comprobar(existsSync(join(RAIZ, carpeta)), `Falta la carpeta: ${carpeta}/`);
}

// 2 · Manifiestos raiz
for (const archivo of ARCHIVOS_RAIZ) {
  comprobar(existsSync(join(RAIZ, archivo)), `Falta el archivo raiz: ${archivo}`);
}

// 3 · package.json raiz bien formado
if (existsSync(join(RAIZ, 'package.json'))) {
  const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
  comprobar(pkg.private === true, 'package.json raiz debe ser "private": true');
  comprobar(
    typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm@'),
    'package.json raiz debe fijar "packageManager": "pnpm@<version>"',
  );
  comprobar(
    typeof pkg.engines?.node === 'string',
    'package.json raiz debe declarar "engines.node"',
  );
}

// 4 · historico/ fuera de los workspaces
if (existsSync(join(RAIZ, 'pnpm-workspace.yaml'))) {
  const ws = readFileSync(join(RAIZ, 'pnpm-workspace.yaml'), 'utf8');
  comprobar(
    !/^\s*-\s*['"]?historico/m.test(ws),
    'pnpm-workspace.yaml no debe incluir historico/ como workspace',
  );
  for (const glob of ['apps/*', 'packages/*']) {
    comprobar(ws.includes(glob), `pnpm-workspace.yaml debe declarar el glob ${glob}`);
  }
}

// 5 · historico/ ignorado por git  (R34 + "historico/ es evidencia, no codigo")
try {
  execFileSync('git', ['check-ignore', '-q', 'historico/cualquier-cosa.txt'], {
    cwd: RAIZ,
    stdio: 'ignore',
  });
} catch {
  fallos.push('historico/ NO esta ignorado por git (.gitignore)');
}

// 6 · .gitignore cubre lo minimo exigido por F1.0-T01
if (existsSync(join(RAIZ, '.gitignore'))) {
  const ignore = readFileSync(join(RAIZ, '.gitignore'), 'utf8');
  for (const patron of ['.env', 'node_modules', '.next', 'dist', 'coverage']) {
    comprobar(
      ignore.split(/\r?\n/).some((linea) => linea.trim().replace(/^\//, '') === patron),
      `.gitignore debe excluir "${patron}"`,
    );
  }
}

if (fallos.length > 0) {
  console.error('✗ Estructura del monorepo incompleta:\n');
  for (const fallo of fallos) console.error(`  · ${fallo}`);
  console.error(`\n${fallos.length} fallo(s).`);
  process.exit(1);
}

console.log(
  `✓ Estructura del monorepo correcta (${CARPETAS.length} carpetas, ${ARCHIVOS_RAIZ.length} manifiestos).`,
);
