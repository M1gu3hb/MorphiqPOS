#!/usr/bin/env node
/**
 * EL ENSAYO DE LAS MIGRACIONES, SOBRE UNA COPIA CON DATOS.
 *
 * ── Por qué no vale ensayar sobre una base vacía ────────────────────────────
 * `ensayar-restauracion.mjs` aplica las migraciones sobre una base vacía y
 * restaura los datos DESPUÉS. Con ese orden, la poscondición de la 058 —la que
 * comprueba que los cuatro negocios quedaron en su plantilla— corre sobre cero
 * filas y pasa sin probar nada. Lo mismo vale para cualquier `check` nuevo
 * sobre una columna que ya tiene valores: sin filas, no hay nada que violar.
 *
 * Aquí el orden es el de F3-REGLAS §4.2, que es el único que prueba lo que va
 * a pasar de verdad:
 *
 *   1 · Se levanta un PostgreSQL desechable.
 *   2 · Se aplican ahí las migraciones YA APLICADAS en producción (001-057).
 *   3 · Se carga el respaldo lógico: ahora es una copia de producción.
 *   4 · Se aplican encima las pendientes, con el MISMO texto SQL que va a
 *       recibir producción.
 *   5 · Se comprueban los cuatro negocios y su plantilla, con datos reales.
 *
 * ── Por qué PGlite y no Docker ──────────────────────────────────────────────
 * En esta máquina no hay Docker ni un PostgreSQL local. PGlite es PostgreSQL
 * de verdad compilado a WebAssembly: hace cumplir `check`, claves foráneas,
 * disparadores y restricciones de exclusión GiST, que es justo lo que la base
 * falsa de las 2 567 pruebas unitarias NO modela y por lo que dos `check` de
 * `movimientos_caja` y `movimientos_stock` llegaron a reventar sin que ninguna
 * prueba lo viera.
 *
 * Lo que este ensayo NO prueba, y hay que decirlo:
 *   · PGlite es PostgreSQL 18 y producción es 17.6.
 *   · No hay roles reales de Supabase: `anon`, `authenticated` y
 *     `morphiqpos_app` se crean vacíos para que los `grant` y `revoke` tengan
 *     a quién apuntar, pero aquí nadie se conecta con ellos.
 *   · `pg_cron` no existe; el ejecutor ya trae su portabilidad para la 053.
 *
 * Uso:
 *   node scripts/ensayo-con-datos.mjs [--respaldo <archivo.sql>]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

import { leerMigraciones } from '../packages/data/src/migraciones/lectura.ts';
import {
  LEDGER,
  prepararSqlMigracion,
  prepararTandaVinculada,
} from '../packages/data/src/migraciones/ejecutor.ts';

/** La primera linea del mensaje de error, que es la que dice que paso. */
function primeraLinea(error) {
  return String(error?.message ?? error)
    .split(String.fromCharCode(10))[0]
    .trim();
}

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const RESPALDOS = join(dirname(RAIZ), 'respaldos');

/** La última versión que producción tiene aplicada hoy. Se comprueba, no se supone. */
const FRONTERA_POR_OMISION = 57;

/**
 * Los roles que las migraciones nombran en sus `grant` y `revoke`.
 *
 * En Supabase existen de fábrica; en un PostgreSQL desnudo no. Sin ellos la
 * primera migración con `revoke all on … from anon` aborta con «role "anon"
 * does not exist», y el ensayo fallaría por el entorno en vez de por el SQL.
 */
const ROLES = ['morphiqpos_app', 'anon', 'authenticated', 'service_role'];

function respaldoMasReciente() {
  const indice = process.argv.indexOf('--respaldo');
  if (indice !== -1) return process.argv[indice + 1];
  if (!existsSync(RESPALDOS)) return undefined;
  const archivos = readdirSync(RESPALDOS)
    .filter((n) => n.endsWith('.sql'))
    .sort();
  const ultimo = archivos.at(-1);
  return ultimo === undefined ? undefined : join(RESPALDOS, ultimo);
}

/**
 * Carga el respaldo tal cual, incluidas sus órdenes de sesión.
 *
 * El `set session_replication_role = replica` del respaldo NO es decoración:
 * al insertar una organización salta un disparador que le crea su almacén
 * principal, y entonces el `insert` de `almacenes` del propio respaldo choca
 * contra `almacenes_principal_unico`. Es lo mismo que hace `pg_dump` con
 * `--disable-triggers`, y por eso se conserva: restaurar es reponer filas, no
 * volver a ejecutar la lógica que las creó.
 */
function sqlDeRespaldo(archivo) {
  return readFileSync(archivo, 'utf8');
}

async function main() {
  const archivo = respaldoMasReciente();
  if (archivo === undefined || !existsSync(archivo)) {
    console.error('✗ No hay respaldo que cargar. Corre antes: node scripts/respaldo-logico.mjs');
    process.exit(2);
  }

  const enDisco = leerMigraciones();
  const frontera = Number(process.env['MORPHIQPOS_ENSAYO_FRONTERA'] ?? FRONTERA_POR_OMISION);
  const base = enDisco.filter((m) => m.version <= frontera);
  const pendientes = enDisco.filter((m) => m.version > frontera);

  console.log('');
  console.log('ENSAYO CON DATOS · una copia de produccion y las pendientes encima');
  console.log('');
  console.log(`  respaldo    ${archivo}`);
  console.log(
    `  frontera    ${frontera} · ${base.length} ya aplicadas · ${pendientes.length} pendientes`,
  );
  console.log('');

  const db = await PGlite.create({ extensions: { btree_gist, pg_trgm, unaccent } });
  const paso = async (titulo, sql) => {
    const inicio = Date.now();
    try {
      await db.exec(sql);
    } catch (error) {
      console.log(`  ✗ ${titulo}`);
      console.log('');
      console.log(String(error?.message ?? error));
      await db.close();
      process.exit(1);
    }
    console.log(`  ✓ ${titulo} · ${Date.now() - inicio} ms`);
  };

  await paso(
    `roles de Supabase creados vacios (${ROLES.join(', ')})`,
    ROLES.map((rol) => `create role ${rol};`).join('\n'),
  );

  // El ledger lo crea el ejecutor antes de la tanda; aqui hay que hacer lo
  // mismo, porque `prepararTandaVinculada` da por hecho que la tabla existe.
  await paso('ledger _migraciones creado', `${LEDGER};`);

  await paso(
    `migraciones 001-${String(frontera).padStart(3, '0')} · el esquema que produccion tiene hoy`,
    prepararTandaVinculada(base, false),
  );

  const antes = await db.query(`select count(*)::int as n from public.organizaciones`);

  // ── Por qué hay que vaciar antes de cargar ────────────────────────────────
  // La 042 SIEMBRA datos de demostración: almacenes, productos y más. Aplicar
  // las migraciones no deja una base vacía, deja una base con su semilla. Si el
  // respaldo se carga encima, el primer `insert` de `almacenes` choca contra
  // `almacenes_principal_unico` — y el choque es correcto: son dos filas para el
  // mismo sitio. Restaurar es DEJAR LA BASE COMO ESTABA, y como estaba incluía
  // esas filas con los ids de producción, no los de la semilla.
  const tablasParaVaciar = await db.query(
    `select c.relname as nombre
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace nm on nm.oid = c.relnamespace
      where nm.nspname = 'public' and c.relkind in ('r','p') and c.relname <> '_migraciones'
      order by c.relname`,
  );
  await paso(
    `${tablasParaVaciar.rows.length} tablas vaciadas · la semilla de la 042 sale antes del respaldo`,
    `truncate table ${tablasParaVaciar.rows.map((f) => `public.${f.nombre}`).join(', ')} cascade;`,
  );

  await paso(`respaldo cargado (${archivo.split(/[\\/]/).at(-1)})`, sqlDeRespaldo(archivo));

  const despues = await db.query(`select count(*)::int as n from public.organizaciones`);
  console.log(
    `    organizaciones: ${antes.rows[0].n} antes del respaldo · ${despues.rows[0].n} despues`,
  );

  if (despues.rows[0].n === 0) {
    console.log('');
    console.log('✗ El respaldo no cargo ninguna organizacion. Un ensayo sobre cero filas');
    console.log('  no prueba nada: es exactamente el error que este script existe para evitar.');
    await db.close();
    process.exit(1);
  }

  // ── Una por una, pero dentro de UNA transaccion ──────────────────────────
  // El texto de cada migracion es el MISMO que recibira produccion —sale de
  // `prepararSqlMigracion`, la funcion del ejecutor— y la tanda sigue siendo
  // todo o nada. La diferencia es que aqui, cuando algo falla, el mensaje dice
  // QUE ARCHIVO fue. Con la tanda en un solo `exec`, el error era «column
  // c.sucursal_id does not exist» sobre setenta archivos a la vez.
  //
  // `--seguir` cambia el modo: en vez de parar en el primer fallo, envuelve
  // cada migracion en un SAVEPOINT y sigue. Sirve para VER LA LISTA de una
  // sola pasada en vez de descubrirlas de una en una, a un arranque por
  // defecto. No sustituye a la corrida normal: un fallo tardio puede ser
  // consecuencia de una migracion que se salto, asi que la lista se lee como
  // pistas y se confirma corriendo sin `--seguir`.
  const seguir = process.argv.includes('--seguir');
  const rotas = [];

  await paso('transaccion abierta para la tanda', 'begin;');
  for (const migracion of pendientes) {
    const inicio = Date.now();
    if (seguir) await db.exec('savepoint una_migracion;');
    try {
      await db.exec(prepararSqlMigracion(migracion));
      await db.exec(
        `insert into _migraciones (version, nombre, hash, duracion_ms) values ` +
          `(${migracion.version}, '${migracion.nombre.replaceAll("'", "''")}', ` +
          `'${migracion.hash.replaceAll("'", "''")}', 0);`,
      );
      if (seguir) await db.exec('release savepoint una_migracion;');
    } catch (error) {
      const mensaje = primeraLinea(error);
      if (!seguir) {
        console.log(`  ✗ ${migracion.archivo}`);
        console.log('');
        console.log(mensaje);
        console.log('');
        console.log('  La tanda NO se aplica a produccion hasta que esto pase en verde.');
        await db.close();
        process.exit(1);
      }
      rotas.push({ archivo: migracion.archivo, mensaje });
      console.log(`  ✗ ${migracion.archivo} · ${mensaje}`);
      await db.exec('rollback to savepoint una_migracion;');
      await db.exec('release savepoint una_migracion;');
      continue;
    }
    const ms = Date.now() - inicio;
    if (ms > 200) console.log(`  · ${migracion.archivo} · ${ms} ms`);
  }

  if (seguir && rotas.length > 0) {
    console.log('');
    console.log(`✗ ${rotas.length} migracion(es) fallan. En orden:`);
    for (const rota of rotas) console.log(`  · ${rota.archivo} → ${rota.mensaje}`);
    console.log('');
    console.log('  Ojo: en modo --seguir un fallo tardio puede venir de una que se salto.');
    console.log('  Se arreglan y se vuelve a correr SIN --seguir para confirmar.');
    await db.close();
    process.exit(1);
  }

  await paso(`las ${pendientes.length} pendientes aplicadas y confirmadas`, 'commit;');

  // ── La comprobacion que solo tiene sentido con datos ──────────────────────
  const negocios = await db.query(
    `select nombre, giro, paquete from public.organizaciones order by nombre`,
  );
  console.log('');
  console.log('  Los negocios, despues del renombre de plantillas:');
  for (const fila of negocios.rows) {
    console.log(
      `    ${String(fila.nombre).padEnd(28)} giro ${String(fila.giro).padEnd(12)} → ${fila.paquete}`,
    );
  }

  const check = await db.query(
    `select pg_catalog.pg_get_constraintdef(oid) as definicion
       from pg_catalog.pg_constraint where conname = 'organizaciones_paquete_check'`,
  );
  console.log('');
  console.log(`  check de plantillas: ${check.rows[0]?.definicion ?? '(no existe)'}`);

  const ledger = await db.query(
    `select count(*)::int as n, max(version) as ultima from public._migraciones`,
  );
  console.log(`  ledger: ${ledger.rows[0].n} migraciones · ultima ${ledger.rows[0].ultima}`);

  const tablas = await db.query(
    `select count(*)::int as n from pg_catalog.pg_class c
       join pg_catalog.pg_namespace nm on nm.oid = c.relnamespace
      where nm.nspname = 'public' and c.relkind in ('r','p')`,
  );
  console.log(`  tablas en public: ${tablas.rows[0].n}`);

  await db.close();
  console.log('');
  console.log('✓ Ensayo correcto: las pendientes aplican sobre una copia CON DATOS de produccion.');
}

await main();
