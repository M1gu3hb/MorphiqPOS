#!/usr/bin/env node
/**
 * Contrato: cada prueba corre bajo la puerta que le toca, y ninguna se queda
 * sin correr.
 *
 * Existe por un defecto real de F1.0. Cinco paquetes declaraban su propio
 * script `test:unit` con un `vitest run` pelado. Vitest toma la configuración
 * del directorio desde el que se invoca, así que esos scripts NO veían la
 * configuración raíz — la que excluye `*.integracion.test.ts`. Resultado:
 * `pnpm --filter @morphiqpos/testing test:unit` arrastraba una prueba de
 * integración, fallaba por falta de Postgres, y la reacción natural habría
 * sido saltarse la prueba en vez de arreglar la invocación.
 *
 * El contrato NO mira la configuración y afirma que dice lo correcto: le
 * pregunta a Vitest qué archivos recoge de verdad. Una lista de exclusión bien
 * escrita pero invocada desde el sitio equivocado sigue siendo un agujero, y
 * sólo la recolección real lo enseña.
 *
 * Comprueba tres cosas, y las dos primeras son espejo:
 *
 *   1. La puerta unitaria NO recoge ninguna `*.integracion.test.ts`.
 *   2. TODA `*.integracion.test.ts` del disco la recoge la puerta de
 *      integración. Sin esto, bastaría con excluirlas de las dos para que el
 *      contrato pasara y nadie las ejecutara nunca.
 *   3. Ningún paquete declara su propio script de pruebas: volvería a invocar
 *      Vitest sin la configuración raíz, que es la causa original.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const problemas = [];

// Se invoca el binario de Vitest con el mismo Node que corre este script, no
// `pnpm exec`: en Windows `pnpm` es `pnpm.cmd` y `execFileSync` no lo resuelve
// sin shell. Pasar por el shell obligaría a entrecomillar la ruta del
// repositorio, que aquí tiene espacios ("MIS PROYECTOS").
const VITEST = join(RAIZ, 'node_modules', 'vitest', 'vitest.mjs');

/** Pregunta a Vitest qué archivos recogería, sin ejecutarlos. */
function recolectar(config) {
  const args = [VITEST, 'list', '--filesOnly'];
  if (config) args.push('--config', config);
  const salida = execFileSync(process.execPath, args, {
    cwd: RAIZ,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return salida
    .split('\n')
    .map((l) => l.trim().replaceAll('\\', '/'))
    .filter((l) => l.endsWith('.test.ts'));
}

/** Todas las `*.integracion.test.ts` que existen en el disco. */
function integracionEnDisco(dir = RAIZ, encontradas = []) {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === 'historico' || entrada === '.git') continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) integracionEnDisco(ruta, encontradas);
    else if (entrada.endsWith('.integracion.test.ts')) {
      encontradas.push(relative(RAIZ, ruta).replaceAll('\\', '/'));
    }
  }
  return encontradas;
}

// ── 1 · La puerta unitaria no toca las de integración ───────────────────────
const unitarias = recolectar(null);
for (const archivo of unitarias) {
  if (archivo.includes('.integracion.')) {
    problemas.push(
      `la puerta unitaria recoge una prueba de integración: ${archivo}\n` +
        '      Necesita Postgres. Corre con `pnpm test:integracion`.',
    );
  }
}
if (unitarias.length === 0) {
  problemas.push('la puerta unitaria no recoge NINGUNA prueba. Algo la dejó ciega.');
}

// ── 2 · Y las de integración las recoge alguien ─────────────────────────────
const enDisco = integracionEnDisco();
if (enDisco.length > 0) {
  const deIntegracion = recolectar('vitest.integracion.config.ts');
  for (const archivo of enDisco) {
    if (!deIntegracion.some((r) => r.endsWith(archivo))) {
      problemas.push(
        `prueba de integración que no corre en ninguna puerta: ${archivo}\n` +
          '      Está en el disco y nadie la ejecuta: es peor que no tenerla.',
      );
    }
  }
}

// ── 3 · Ningún paquete reintroduce su propio `vitest run` ───────────────────
for (const grupo of ['packages', 'apps']) {
  const base = join(RAIZ, grupo);
  for (const paquete of readdirSync(base)) {
    const manifiesto = join(base, paquete, 'package.json');
    let scripts;
    try {
      scripts = JSON.parse(readFileSync(manifiesto, 'utf8')).scripts ?? {};
    } catch {
      continue;
    }
    for (const [nombre, orden] of Object.entries(scripts)) {
      if (nombre.startsWith('test') && String(orden).includes('vitest')) {
        problemas.push(
          `${grupo}/${paquete} declara "${nombre}": ${orden}\n` +
            '      Vitest lee la configuración del directorio donde se invoca, así que\n' +
            '      desde el paquete NO ve la exclusión de la raíz. Las pruebas se corren\n' +
            '      desde la raíz con `pnpm test:unit` / `pnpm test:integracion`.',
        );
      }
    }
  }
}

if (problemas.length > 0) {
  console.error('✗ Contrato de pruebas incumplido:\n');
  for (const p of problemas) console.error(`    · ${p}`);
  process.exit(1);
}

console.log(
  `✓ Pruebas: ${unitarias.length} unitarias en la puerta correcta, ` +
    `${enDisco.length} de integración cubiertas, cero scripts que esquiven la raíz.`,
);
