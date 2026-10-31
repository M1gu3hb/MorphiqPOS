#!/usr/bin/env node
/**
 * EXPORTAR UN NEGOCIO de la base compartida para mudarlo a la suya (PAR-1, de DP-10.5 de
 * POS Don Poncho).
 *
 *   node --conditions=react-server scripts/exportar-negocio.mjs --org <slug> --id <uuid> \
 *     [--salida ..\_PRIVADO\mudanza\<fecha>] [--exigir-cerrado] [--sin-archivos]
 *
 * El negocio se nombra con su slug Y su id, y los dos tienen que ser de la MISMA fila de
 * `organizaciones`: un slug se cambia desde la configuración y un id copiado de otro lado no
 * se distingue a simple vista; los dos juntos no se equivocan de negocio.
 *
 * SÓLO LEE. Una transacción `read only` con la instantánea fija (`repeatable read`): todas las
 * tablas salen del mismo instante. Con `DATABASE_URL` y `STORAGE_*` del entorno (los de la base
 * y el almacén de ORIGEN). Escribe en `--salida`:
 *   · `manifiesto.json`: el negocio, las migraciones del origen y, por tabla, sus columnas, sus
 *     filas y su md5 (`lib/mudanza.mjs`), con los que el importador comprueba el destino;
 *   · `tablas/<tabla>.ndjson`: una fila por renglón, como `to_jsonb` (sin pasar por números de
 *     JavaScript: un `bigint` o un `numeric` no pierden dígitos);
 *   · `archivos/…` y `archivos.json`: todo el bucket, con el md5 de cada archivo.
 *
 * LA SALIDA VA FUERA DEL REPOSITORIO (por omisión `..\_PRIVADO\mudanza\<fecha>`): trae los hashes
 * de los PIN y los datos del negocio, y el repositorio es público. Se niega a escribir dentro.
 *
 * `--exigir-cerrado` (el día de la mudanza) se niega si hay cajas abiertas, cuentas vivas,
 * comandas en marcha o mesas unidas: con el restaurante abierto, lo que pase después de exportar
 * no viaja.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { argumento, cargarEntorno } from './lib/guion.mjs';
import {
  fijarTexto,
  huellaDeTabla,
  ident,
  leerCatalogo,
  ordenDe,
  planDelNegocio,
} from './lib/mudanza.mjs';

cargarEntorno();
const RAIZ = process.cwd();
const slug = argumento('org');
const exigirCerrado = process.argv.includes('--exigir-cerrado');
const conArchivos = !process.argv.includes('--sin-archivos');
const fecha = new Date().toISOString().replaceAll(':', '').slice(0, 15);
const salida = resolve(argumento('salida', join(RAIZ, '..', '_PRIVADO', 'mudanza', fecha)));

const { ESTADOS_COBRABLES } = await import('../packages/data/src/repos/ordenes/cierre.ts');
const id = argumento('id');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (slug === null || id === null || !UUID.test(id)) {
  console.error('Uso: exportar-negocio.mjs --org <slug> --id <uuid> [--salida <carpeta>] …');
  process.exit(2);
}
const negocio = { id, slug };
const dentro = relative(RAIZ, salida);
if (!dentro.startsWith('..') && !isAbsolute(dentro)) {
  console.error(
    '✗ La salida queda DENTRO del repositorio, que es público. Ponla en ..\\_PRIVADO\\.',
  );
  process.exit(2);
}
if (existsSync(salida) && readdirSync(salida).length > 0) {
  console.error(`✗ ${salida} ya tiene algo: cada exportación va a una carpeta nueva.`);
  process.exit(2);
}

const { Client } = createRequire(join(RAIZ, 'packages', 'data', 'package.json'))('pg');
const url = new URL(process.env['DATABASE_URL'] ?? 'x://');
const local = ['localhost', '127.0.0.1'].includes(url.hostname);
const cliente = new Client({
  connectionString: url.toString(),
  ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
});

const inicio = Date.now();
await cliente.connect();
const manifiesto = { version: 1, negocio, exportadoEn: new Date().toISOString(), tablas: [] };
try {
  await cliente.query('begin transaction isolation level repeatable read read only');
  await fijarTexto(cliente);
  const { rows: org } = await cliente.query('select slug from organizaciones where id = $1', [
    negocio.id,
  ]);
  if (org[0]?.slug !== negocio.slug)
    throw new Error(`La base no tiene a «${negocio.slug}» con su id.`);

  manifiesto.avisos = await enMarcha(negocio.id);
  for (const [que, cuantas] of Object.entries(manifiesto.avisos)) {
    if (cuantas > 0) console.log(`  ⚠ ${que}: ${String(cuantas)}`);
  }
  if (exigirCerrado && Object.values(manifiesto.avisos).some((n) => n > 0)) {
    throw new Error(
      'El restaurante no está cerrado (ver arriba): la mudanza se hace sin nada en marcha.',
    );
  }

  const { rows: migraciones } = await cliente.query(
    'select version, nombre, hash from _migraciones order by version',
  );
  manifiesto.migraciones = migraciones;
  const catalogo = await leerCatalogo(cliente);
  const plan = planDelNegocio(catalogo);
  manifiesto.excluidas = plan.excluidas;
  mkdirSync(join(salida, 'tablas'), { recursive: true });

  for (const [nombre, filtro] of plan.incluidas) {
    const tabla = catalogo.tablas.get(nombre);
    const { rows } = await cliente.query(
      `select to_jsonb(t)::text as fila from ${ident(nombre)} t where ${filtro} order by ${ordenDe(tabla)}`,
      [negocio.id],
    );
    const huella = await huellaDeTabla(cliente, nombre, tabla.columnas, filtro, negocio.id);
    if (huella.filas !== rows.length) throw new Error(`${nombre}: se leyeron filas distintas.`);
    writeFileSync(
      join(salida, 'tablas', `${nombre}.ndjson`),
      rows.map((r) => `${r.fila}\n`).join(''),
    );
    manifiesto.tablas.push({ tabla: nombre, columnas: tabla.columnas, ...huella });
  }
  await cliente.query('commit');
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  // Es una transacción de sólo lectura: si ni el `rollback` contesta, se dice y se cierra igual.
  await cliente.query('rollback').catch((otro) => console.error(`  (rollback: ${String(otro)})`));
  await cliente.end();
  process.exit(1);
}
await cliente.end();
manifiesto.segundosBase = (Date.now() - inicio) / 1000;

if (conArchivos) manifiesto.archivos = await exportarArchivos();
writeFileSync(join(salida, 'manifiesto.json'), `${JSON.stringify(manifiesto, null, 2)}\n`);

const filas = manifiesto.tablas.reduce((s, t) => s + t.filas, 0);
console.log(
  `✓ «${negocio.slug}» exportado a ${salida}: ${String(manifiesto.tablas.length)} tablas, ` +
    `${String(filas)} filas en ${manifiesto.segundosBase.toFixed(1)} s` +
    (conArchivos
      ? `; ${String(manifiesto.archivos.lista.length)} archivos en ${manifiesto.archivos.segundos.toFixed(1)} s`
      : '; sin archivos') +
    `. Fuera de esta exportación (sin camino al negocio): ${manifiesto.excluidas.join(', ')}.`,
);

/** Lo que estaría en marcha: con el restaurante cerrado, todo en cero. */
async function enMarcha(organizacionId) {
  const contar = async (sql, extra = []) =>
    (await cliente.query(`select count(*)::int as n from ${sql}`, [organizacionId, ...extra]))
      .rows[0].n;
  return {
    cajasAbiertas: await contar(`sesiones_caja where organizacion_id = $1 and estado = 'abierta'`),
    cuentasVivas: await contar(`ordenes where organizacion_id = $1 and estado = any($2)`, [
      [...ESTADOS_COBRABLES],
    ]),
    comandasEnMarcha: await contar(
      `comandas where organizacion_id = $1 and estado in ('nuevo','en_preparacion','listo')`,
    ),
    mesasUnidas: await contar(`uniones_mesa where organizacion_id = $1 and cerrada_en is null`),
  };
}

/** Todo el bucket del negocio, archivo por archivo, con su md5. */
async function exportarArchivos() {
  const { crearAlmacenArchivos } = await import('../packages/data/src/archivos.ts');
  const almacen = crearAlmacenArchivos({
    endpoint: process.env['STORAGE_ENDPOINT'] ?? '',
    bucket: process.env['STORAGE_BUCKET'] ?? '',
    accessKey: process.env['STORAGE_ACCESS_KEY'] ?? '',
    secretKey: process.env['STORAGE_SECRET_KEY'] ?? '',
  });
  const desde = Date.now();
  const lista = [];
  for (const { clave } of await almacen.listar('')) {
    if (clave.split('/').some((parte) => parte === '' || parte === '..' || parte === '.')) {
      throw new Error(`Una clave del bucket no es una ruta segura: «${clave}».`);
    }
    const archivo = await almacen.obtener(clave);
    if (archivo === null) throw new Error(`«${clave}» se listó y ya no está.`);
    const destino = join(salida, 'archivos', ...clave.split('/'));
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, archivo.bytes);
    lista.push({
      clave,
      bytes: archivo.bytes.byteLength,
      contentType: archivo.contentType,
      md5: createHash('md5').update(archivo.bytes).digest('hex'),
    });
  }
  return { lista, segundos: (Date.now() - desde) / 1000 };
}
