#!/usr/bin/env node
/**
 * Las clases de PALETA que quedan en unos archivos (C.16 de la 2.4).
 *
 *   node scripts/paleta-restante.mjs <archivo|carpeta>...
 *
 * Imprime cada archivo con sus clases de paleta y sale en 1 si queda alguna. Es la
 * misma definición que usa `verificar-primitivas.mjs` sobre `heredado/`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { clasesDePaleta } from './lib/clases-de-color.mjs';

function archivos(ruta) {
  if (statSync(ruta).isDirectory())
    return readdirSync(ruta).flatMap((n) => archivos(join(ruta, n)));
  return /\.(jsx?|tsx?)$/.test(ruta) ? [ruta] : [];
}

let total = 0;
for (const ruta of process.argv.slice(2).flatMap(archivos)) {
  const quedan = clasesDePaleta(readFileSync(ruta, 'utf8'));
  if (quedan.length === 0) continue;
  total += quedan.length;
  process.stdout.write(`${ruta} · ${String(quedan.length)}: ${quedan.join(' ')}\n`);
}
process.stdout.write(
  total === 0 ? '✓ Sin clases de paleta.\n' : `✗ ${String(total)} clases de paleta.\n`,
);
process.exit(total === 0 ? 0 : 1);
