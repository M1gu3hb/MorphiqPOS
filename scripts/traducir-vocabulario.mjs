#!/usr/bin/env node
/**
 * UN SOLO VOCABULARIO · los colores del sistema se escriben con SU nombre.
 *
 * La etapa 2.35 declaró «un vocabulario de tokens» y dentro de `packages/ui` seguían
 * vivos `text-destructive`, `text-success`, `text-muted-foreground`, `bg-card`: los
 * nombres de shadcn, que en este sistema son ALIAS derivados de los tokens en español
 * (`heredado/index.css`). Dos nombres para un color es la misma enfermedad que dos
 * formas de escribir un token: funcionan igual, y por eso uno se queda atrás.
 *
 * Esto traduce, en `packages/ui/src`, `apps/web/src` y `apps/web/app`, cada utilidad de
 * color de su nombre en inglés al del sistema, con su variante y su opacidad:
 *
 *   oscuro:hover:bg-destructive/40   →   oscuro:hover:bg-peligro/40
 *
 * El heredado NO se toca: es el código de Miguel y sigue escribiendo en inglés contra
 * los alias. `--verificar` no escribe: cuenta lo que queda, y sale en 1 si queda algo.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EN_INGLES, traducir } from './lib/vocabulario-de-color.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const CARPETAS = ['packages/ui/src', 'apps/web/src', 'apps/web/app'].map((c) => join(RAIZ, c));

function archivos(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === 'node_modules' || nombre === '.next') return [];
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(tsx|ts)$/.test(nombre) && !nombre.includes('.test.') ? [ruta] : [];
  });
}

const verificar = process.argv.includes('--verificar');
let total = 0;
const tocados = [];
for (const ruta of CARPETAS.flatMap(archivos)) {
  const texto = readFileSync(ruta, 'utf8');
  const cuantos = texto.match(EN_INGLES)?.length ?? 0;
  if (cuantos === 0) continue;
  total += cuantos;
  tocados.push(`${relative(RAIZ, ruta)} (${String(cuantos)})`);
  if (!verificar) writeFileSync(ruta, traducir(texto));
}

if (verificar) {
  if (total > 0) {
    console.error(`✗ ${String(total)} utilidad(es) de color con el nombre en inglés:`);
    for (const t of tocados.slice(0, 15)) console.error(`  ${t}`);
    console.error('  Corre `node scripts/traducir-vocabulario.mjs` para traducirlas.');
    process.exit(1);
  }
  console.log('✓ Un solo vocabulario: ningún color del sistema con su alias en inglés.');
} else {
  console.log(`${String(total)} utilidad(es) traducidas en ${String(tocados.length)} archivo(s).`);
}
