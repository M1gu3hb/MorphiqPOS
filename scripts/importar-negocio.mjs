#!/usr/bin/env node
/**
 * IMPORTAR UN NEGOCIO a su base nueva (PAR-1, de DP-10.5 de POS Don Poncho), desde lo que dejó
 * `exportar-negocio.mjs`.
 *
 *   node --conditions=react-server scripts/importar-negocio.mjs --desde <carpeta> --id <uuid> \
 *     --base <postgres://…destino> [--archivos-destino <carpeta>] [--solo-verificar]
 *
 * El destino es una base NUEVA con las migraciones aplicadas desde cero (`pnpm db:migrate`). Se
 * niega si es la base compartida, si ya tiene otro negocio que los de demostración de la 042, si
 * ya tiene a éste, o si le falta una migración del origen (o la tiene con otro hash).
 *
 * TODO EN UNA SOLA TRANSACCIÓN, con los ID de siempre:
 *   · `session_replication_role = replica`: sin disparadores. Los ledgers inmutables se INSERTAN
 *     tal cual y ningún saldo se vuelve a aplicar (las existencias ya vienen). Apaga también la
 *     comprobación de llaves foráneas: se hace a mano antes del `commit` (`llavesRotas`).
 *   · Las columnas que el destino tenga de más (una migración posterior) toman su valor por
 *     omisión; las generadas las calcula la base.
 *   · Las secuencias quedan después del mayor id importado.
 *   · Antes del `commit`, cada tabla se cuenta y se le saca el md5 en el destino: si una sola no
 *     es igual a la del origen, no se guarda nada.
 * Después copia el bucket (`STORAGE_*` del entorno, los del DESTINO, o `--archivos-destino` en un
 * ensayo) y lee de vuelta cada archivo para comparar su md5.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { argumento, cargarEntorno } from './lib/guion.mjs';
import {
  diferenciasConElManifiesto,
  fijarTexto,
  ident,
  leerCatalogo,
  llavesRotas,
} from './lib/mudanza.mjs';

cargarEntorno();
const RAIZ = process.cwd();
const desde = resolve(argumento('desde', ''));
const base = argumento('base', '');
const carpetaDestino = argumento('archivos-destino');
const soloVerificar = process.argv.includes('--solo-verificar');
const LOTE = 500;
/** El proyecto de la base compartida (Fase A): aquí nunca se importa nada. */
const COMPARTIDA = 'wyqmzhliurwyxuyxznpb';

if (desde === '' || base === '') {
  console.error(
    'Uso: importar-negocio.mjs --desde <carpeta> --id <uuid> --base <postgres://…> [--archivos-destino <carpeta>]',
  );
  process.exit(2);
}
if (base.includes(COMPARTIDA) || (process.env['STORAGE_ENDPOINT'] ?? '').includes(COMPARTIDA)) {
  console.error(
    '✗ El destino es la base o el almacén COMPARTIDO de la Fase A: aquí no se importa.',
  );
  process.exit(2);
}
const manifiesto = JSON.parse(readFileSync(join(desde, 'manifiesto.json'), 'utf8'));
const { NEGOCIOS_REALES } = await import('../packages/contracts/src/negocios/index.ts');
// El negocio se confirma con su id (PAR-1): el manifiesto dice de quién es y aquí se repite.
if (argumento('id') !== manifiesto.negocio.id) {
  console.error(
    `✗ El manifiesto es de «${String(manifiesto.negocio.slug)}» (${String(manifiesto.negocio.id)}): ` +
      'confírmalo con --id <ese mismo id>.',
  );
  process.exit(2);
}

const { Client } = createRequire(join(RAIZ, 'packages', 'data', 'package.json'))('pg');
const url = new URL(base);
const cliente = new Client({
  connectionString: base,
  ...(['localhost', '127.0.0.1'].includes(url.hostname)
    ? {}
    : { ssl: { rejectUnauthorized: false } }),
});
await cliente.connect();
const inicio = Date.now();
try {
  if (soloVerificar) {
    await cliente.query('begin transaction read only');
    await fijarTexto(cliente);
    await exigirIgual();
    await cliente.query('commit');
    console.log(`✓ ${String(manifiesto.tablas.length)} tablas idénticas al origen (filas y md5).`);
  } else {
    await importar();
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  await cliente.query('rollback').catch((otro) => console.error(`  (rollback: ${String(otro)})`));
  await cliente.end();
  process.exit(1);
}
await cliente.end();
if (!soloVerificar) await copiarArchivos();

async function importar() {
  await exigirBaseNueva();
  await cliente.query('begin');
  await cliente.query('set local session_replication_role = replica');
  await fijarTexto(cliente);
  const catalogo = await leerCatalogo(cliente);
  let filas = 0;
  for (const { tabla, columnas, filas: esperadas } of manifiesto.tablas) {
    const destino = catalogo.tablas.get(tabla);
    if (destino === undefined) throw new Error(`El destino no tiene la tabla «${tabla}».`);
    const faltan = columnas.filter((c) => !destino.columnas.includes(c));
    if (faltan.length > 0)
      throw new Error(`«${tabla}» no tiene ${faltan.join(', ')} en el destino.`);
    const escribibles = columnas.filter((c) => !destino.generadas.includes(c)).map(ident);
    const lineas = readFileSync(join(desde, 'tablas', `${tabla}.ndjson`), 'utf8')
      .split('\n')
      .filter((l) => l !== '');
    if (lineas.length !== esperadas)
      throw new Error(`${tabla}.ndjson no trae ${String(esperadas)} filas.`);
    for (let i = 0; i < lineas.length; i += LOTE) {
      await cliente.query(
        `insert into ${ident(tabla)} (${escribibles.join(', ')})
         select ${escribibles.join(', ')} from jsonb_populate_recordset(null::public.${ident(tabla)}, $1::jsonb)`,
        [`[${lineas.slice(i, i + LOTE).join(',')}]`],
      );
    }
    await ajustarSecuencias(tabla, destino.columnas);
    filas += lineas.length;
  }
  const rotas = await llavesRotas(
    cliente,
    catalogo,
    new Set(manifiesto.tablas.map((t) => t.tabla)),
  );
  if (rotas.length > 0) throw new Error(`Llaves foráneas rotas: ${rotas.join(', ')}.`);
  await exigirIgual();
  await cliente.query('commit');
  console.log(
    `✓ «${manifiesto.negocio.slug}» importado: ${String(manifiesto.tablas.length)} tablas, ${String(filas)} filas, ` +
      `idénticas al origen (filas y md5) y sin llaves rotas, en ${((Date.now() - inicio) / 1000).toFixed(1)} s.`,
  );
}

/**
 * Una base recién migrada: sin otro negocio que los tres que siembra la 042, y sin éste. En el
 * maestro esos tres son los de `NEGOCIOS_REALES` cuyo slug empieza por `demo-` (nacieron como
 * demostraciones; ver `packages/contracts/src/negocios`).
 */
async function exigirBaseNueva() {
  const demos = NEGOCIOS_REALES.filter((n) => n.slug.startsWith('demo-')).map((n) => n.id);
  const { rows: otros } = await cliente.query(
    'select slug from organizaciones where not (id = any($1::uuid[]))',
    [demos],
  );
  if (otros.length > 0) {
    throw new Error(`No es una base nueva: ya tiene ${otros.map((o) => o.slug).join(', ')}.`);
  }
  const { rows: aplicadas } = await cliente.query('select version, hash from _migraciones');
  const delDestino = new Map(aplicadas.map((m) => [m.version, m.hash]));
  const faltan = manifiesto.migraciones.filter((m) => delDestino.get(m.version) !== m.hash);
  if (faltan.length > 0) {
    throw new Error(
      `Al destino le faltan (o tiene distintas) las migraciones ${faltan.map((m) => m.version).join(', ')}: ` +
        'aplícalas desde cero con `pnpm db:migrate` antes de importar.',
    );
  }
}

/** Las secuencias de la tabla, después del mayor valor que ya tiene. */
async function ajustarSecuencias(tabla, columnas) {
  for (const columna of columnas) {
    const { rows } = await cliente.query('select pg_get_serial_sequence($1, $2) as secuencia', [
      `public.${ident(tabla)}`,
      columna,
    ]);
    const secuencia = rows[0]?.secuencia ?? null;
    if (secuencia === null) continue;
    await cliente.query(
      `select setval($1, greatest(coalesce(max(${ident(columna)}), 0), 1), count(*) > 0) from ${ident(tabla)}`,
      [secuencia],
    );
  }
}

async function exigirIgual() {
  const distintas = await diferenciasConElManifiesto(cliente, manifiesto);
  if (distintas.length > 0) throw new Error(`No es igual al origen:\n  ${distintas.join('\n  ')}`);
}

/** El bucket, archivo por archivo, leído de vuelta para comparar su md5. */
async function copiarArchivos() {
  const lista = manifiesto.archivos?.lista ?? [];
  const desdeArchivos = Date.now();
  const almacen = carpetaDestino === null ? await almacenDelDestino() : null;
  for (const archivo of lista) {
    const bytes = readFileSync(join(desde, 'archivos', ...archivo.clave.split('/')));
    if (md5(bytes) !== archivo.md5)
      throw new Error(`«${archivo.clave}» llegó dañado a la exportación.`);
    let deVuelta;
    if (almacen === null) {
      const ruta = join(resolve(carpetaDestino), ...archivo.clave.split('/'));
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(ruta, bytes);
      deVuelta = readFileSync(ruta);
    } else {
      await almacen.guardar(archivo.clave, new Uint8Array(bytes), archivo.contentType);
      deVuelta = (await almacen.obtener(archivo.clave))?.bytes ?? new Uint8Array();
    }
    if (md5(deVuelta) !== archivo.md5)
      throw new Error(`«${archivo.clave}» no quedó igual en el destino.`);
  }
  console.log(
    `✓ ${String(lista.length)} archivos copiados e idénticos (md5) en ` +
      `${((Date.now() - desdeArchivos) / 1000).toFixed(1)} s.`,
  );
}

async function almacenDelDestino() {
  const { crearAlmacenArchivos } = await import('../packages/data/src/archivos.ts');
  return crearAlmacenArchivos({
    endpoint: process.env['STORAGE_ENDPOINT'] ?? '',
    bucket: process.env['STORAGE_BUCKET'] ?? '',
    accessKey: process.env['STORAGE_ACCESS_KEY'] ?? '',
    secretKey: process.env['STORAGE_SECRET_KEY'] ?? '',
  });
}

function md5(bytes) {
  return createHash('md5').update(bytes).digest('hex');
}
