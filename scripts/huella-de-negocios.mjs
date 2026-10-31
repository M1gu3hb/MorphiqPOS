#!/usr/bin/env node
/**
 * LA HUELLA DE LOS NEGOCIOS (PAR-1, generalizada de `huella-ajena.mjs` de POS Don Poncho,
 * DP-11.0): que una migración, un despliegue o una escritura de un negocio no toque a nadie más
 * en la base COMPARTIDA. Sólo lee. Ver `scripts/lib/huella.mjs`.
 *
 *   node --conditions=react-server scripts/huella-de-negocios.mjs tomar --salida <archivo.json> \
 *        [--como <antes.json>] [--solo <slug,slug>] [--excluir <slug,slug>]
 *   node scripts/huella-de-negocios.mjs comparar <antes.json> <despues.json>
 *
 * `tomar` usa `DATABASE_URL` del entorno (la de producción NUNCA va en el repositorio) y abre UNA
 * transacción `read only`. Por omisión toma TODOS los negocios; `--solo` y `--excluir` los
 * escogen por slug. `--como` toma la huella sobre las columnas de una toma anterior (después de
 * migrar). `comparar` dice IDÉNTICA, lo que cambió, y el relleno esperado de la 187.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { argumento } from './lib/guion.mjs';
import { columnasDeLaHuella, compararHuellas, tomarHuella } from './lib/huella.mjs';

const accion = process.argv[2];
const lista = (nombre) =>
  (argumento(nombre, '') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');

/** Pastelería Confetti (otro cliente, otro proyecto): no se lee ni para una huella. */
const CONFETTI = 'ivqcxdpqxwjxfohiswqb';

/** ¿La cadena nombra ese proyecto, también con `%xx`? Lo que no se puede leer, cuenta como sí. */
export function nombraAlProyecto(url, ref) {
  try {
    return decodeURIComponent(url).toLocaleLowerCase('en-US').includes(ref) || url.includes(ref);
  } catch {
    return true;
  }
}

export async function tomar(url, { salida, como = null, solo = [], excluir = [] }) {
  if (nombraAlProyecto(url, CONFETTI)) {
    throw new Error(
      'La cadena apunta a Pastelería Confetti: ese proyecto no se toca ni para leer.',
    );
  }
  const requerir = createRequire(join(process.cwd(), 'packages', 'data', 'package.json'));
  const { Client } = requerir('pg');
  // El TLS de la aplicación (raíz de Supabase fijada, `rejectUnauthorized: true`): por este canal
  // viaja la contraseña de la base. En una base local, sin TLS.
  const { tlsPara } = await import('../packages/data/src/tls.ts');
  const cliente = new Client({ connectionString: url, ssl: tlsPara(url) });
  await cliente.connect();
  try {
    const columnasDe = como === null ? null : columnasDeLaHuella(como);
    const huella = await tomarHuella(cliente, { solo, excluir, columnasDe });
    writeFileSync(salida, `${JSON.stringify(huella, null, 2)}\n`);
    const n = Object.values(huella.tablas).reduce(
      (s, t) => s + Object.keys(t.porNegocio).length,
      0,
    );
    console.log(
      `✓ Huella de ${String(huella.organizaciones.length)} negocios: ` +
        `${String(Object.keys(huella.tablas).length)} tablas, ${String(n)} conteos y md5, ` +
        `${String(huella.absorbidas.length)} mesas en uniones abiertas (${huella.tomada}).`,
    );
    return huella;
  } finally {
    await cliente.end();
  }
}

export function comparar(antes, despues) {
  const r = compararHuellas(antes, despues);
  if (r.diferencias.length > 0) {
    console.error(`✗ DISTINTA en ${String(r.diferencias.length)} punto(s):`);
    for (const d of r.diferencias) console.error(`  · ${d}`);
    return r;
  }
  const extra = [];
  if (r.relleno > 0) {
    extra.push(
      `salvo el relleno esperado de la 187: ${String(r.relleno)} mesa(s) absorbida(s) en ` +
        `${String(r.uniones)} unión(es) abierta(s), marcadas con su principal`,
    );
  }
  if (r.nuevas.length > 0) extra.push(`tablas nuevas vacías: ${r.nuevas.join(', ')}`);
  console.log(
    `✓ IDÉNTICA${extra.length > 0 ? ` (${extra.join('; ')})` : ''} ` +
      `(${antes.tomada} → ${despues.tomada}).`,
  );
  return r;
}

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
const esElGuion = process.argv[1]?.endsWith('huella-de-negocios.mjs') ?? false;

if (esElGuion && accion === 'tomar') {
  const url = process.env['DATABASE_URL'] ?? '';
  const salida = argumento('salida');
  if (url === '' || salida === null) {
    console.error('Uso: DATABASE_URL=… huella-de-negocios.mjs tomar --salida <archivo.json>');
    process.exit(2);
  }
  const ruta = argumento('como');
  await tomar(url, {
    salida,
    como: ruta === null ? null : leer(ruta),
    solo: lista('solo'),
    excluir: lista('excluir'),
  });
} else if (esElGuion && accion === 'comparar') {
  if (process.argv[3] === undefined || process.argv[4] === undefined) {
    console.error('Uso: huella-de-negocios.mjs comparar <antes.json> <despues.json>');
    process.exit(2);
  }
  const r = comparar(leer(process.argv[3]), leer(process.argv[4]));
  if (r.diferencias.length > 0) process.exit(1);
} else if (esElGuion) {
  console.error(
    'Uso: huella-de-negocios.mjs tomar --salida <archivo> | comparar <antes> <despues>',
  );
  process.exit(2);
}
