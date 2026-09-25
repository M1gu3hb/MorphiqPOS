#!/usr/bin/env node
/**
 * `pnpm verify:unidades` · toda pantalla que pinta un campo de dinero del puente lo
 * convierte según su `conversion`, por `centavosDe` (bloque C.2 de la 2.4).
 *
 * Nace ROJA: `CitaEnCurso` pintaba `precio_centavos` —que llega en PESOS— como centavos,
 * y un servicio de $350.00 se veía $3.50 (C.1). Y como ése, cada pantalla decidía por el
 * nombre del campo; 22 de los que se llaman `_centavos` llegan en pesos.
 *
 * Dos comprobaciones: que la tabla de unidades coincide con el mapa (su generador en
 * `--verificar`, que corre aparte en la cadena) y que no queda una lectura sin convertir.
 * El analizador es `scripts/lib/unidades.mjs`, con sus pruebas.
 */
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';

import ts from 'typescript';

import { hallazgosDeUnidades } from './lib/unidades.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(RAIZ, 'apps', 'web');
const PANTALLAS = join(WEB, 'src');
const { UNIDADES_DEL_PUENTE } = await import('../apps/web/src/cliente/unidades-del-puente.ts');

function archivos(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

const configuracion = ts.getParsedCommandLineOfConfigFile(
  join(WEB, 'tsconfig.json'),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  },
);
const revisar = archivos(PANTALLAS).map((r) => r.split(sep).join('/'));
const programa = ts.createProgram({
  rootNames: revisar,
  options: { ...configuracion.options, noEmit: true, incremental: false },
});

const hallazgos = hallazgosDeUnidades(programa, UNIDADES_DEL_PUENTE, revisar);

if (hallazgos.length === 0) {
  console.log(
    '✓ Toda lectura de dinero del puente pasa por centavosDe, según la conversión de su campo.',
  );
  process.exit(0);
}

const porArchivo = new Map();
for (const h of hallazgos) {
  const clave = relative(RAIZ, h.archivo).split(sep).join('/');
  if (!porArchivo.has(clave)) porArchivo.set(clave, []);
  porArchivo.get(clave).push(h);
}
console.error(
  `✗ ${String(hallazgos.length)} lectura(s) de dinero del puente sin convertir, en ${String(porArchivo.size)} pantalla(s):\n`,
);
for (const [archivo, lista] of [...porArchivo].sort(([a], [b]) => a.localeCompare(b))) {
  console.error(`  ${archivo}`);
  for (const h of lista) {
    console.error(
      `    :${String(h.linea)}  ${h.entidad}.${h.campo} (llega en ${h.unidad ?? '?'}) · ${h.como}`,
    );
  }
}
console.error(
  "\nLéelo con `centavosDe('<Entidad>', '<campo>', fila.<campo>)` (apps/web/src/cliente/dinero-del-puente.ts).",
);
process.exit(1);
