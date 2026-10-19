#!/usr/bin/env node
/**
 * verify de C.16 · Un commit del heredado que dice «sólo traduce colores», y lo PRUEBA.
 *
 *   node scripts/verificar-traduccion-de-color.mjs <antes> [<despues>]
 *
 * Sin <despues> compara contra el árbol de trabajo. Por cada archivo de
 * `apps/web/heredado/` que cambió entre las dos versiones, quita de ambas TODA
 * clase de color —de paleta o de token, con sus prefijos y su opacidad— y todo
 * espacio, y exige que lo que queda sea idéntico (`scripts/lib/clases-de-color.mjs`).
 *
 * Así se mueve la línea base de `verify:aspecto` sin abrir la puerta: la base
 * vieja → la versión anterior al barrido ya estaba en verde con sus excepciones
 * motivadas, y esto demuestra que el barrido no tocó nada más que color. Una clase
 * de espaciado, un texto, un icono o un atributo que cambie sobrevive a la
 * limpieza, y la puerta lo imprime con su archivo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { sinColores } from './lib/clases-de-color.mjs';

const CARPETA = 'apps/web/heredado';
const [antes, despues] = process.argv.slice(2);
if (antes === undefined) {
  process.stderr.write('Uso: verificar-traduccion-de-color.mjs <antes> [<despues>]\n');
  process.exit(2);
}

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function version(ref, ruta) {
  if (ref === undefined) return readFileSync(ruta, 'utf8');
  try {
    return git('show', `${ref}:${ruta}`);
  } catch {
    return null;
  }
}

const cambiados = git(
  'diff',
  '--name-only',
  antes,
  ...(despues === undefined ? [] : [despues]),
  '--',
  CARPETA,
)
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s !== '');

const malos = [];
for (const ruta of cambiados) {
  const a = version(antes, ruta);
  const d = version(despues, ruta);
  if (a === null || d === null) {
    malos.push(`${ruta} · se creó o se borró: eso no es traducir un color`);
    continue;
  }
  const limpioA = sinColores(a);
  const limpioD = sinColores(d);
  if (limpioA === limpioD) continue;
  let i = 0;
  while (i < limpioA.length && limpioA[i] === limpioD[i]) i += 1;
  malos.push(
    `${ruta} · cambió algo que no es color, cerca de:\n` +
      `      antes:   …${limpioA.slice(Math.max(0, i - 40), i + 60)}…\n` +
      `      después: …${limpioD.slice(Math.max(0, i - 40), i + 60)}…`,
  );
}

const donde = despues === undefined ? 'el árbol de trabajo' : despues;
if (malos.length > 0) {
  process.stdout.write(
    `✗ ${String(malos.length)} de ${String(cambiados.length)} archivo(s) de ${CARPETA} ` +
      `cambiaron algo más que color entre ${antes} y ${donde}:\n  ${malos.join('\n  ')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `✓ ${String(cambiados.length)} archivo(s) de ${CARPETA} cambiaron entre ${antes} y ${donde}, ` +
    'y SÓLO en clases de color.\n',
);
