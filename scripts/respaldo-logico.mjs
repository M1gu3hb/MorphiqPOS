#!/usr/bin/env node
/**
 * Respaldo lógico de la base viva, sin `pg_dump`.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────────
 * F2.3-REGLAS §4.1 pide un respaldo COMPROBADO antes de la primera migración, y
 * nombra `supabase db dump --linked`. En esta máquina no hay CLI de Supabase,
 * ni `pg_dump`, ni Docker. Un encargo que no se puede detener necesitaba otra
 * vía, y ésta es la que hay:
 *
 *   · El ESQUEMA ya está respaldado: son las migraciones aplicadas, que viven
 *     versionadas en `packages/data/src/migraciones/sql/`. Restaurar el esquema
 *     es volver a aplicarlas sobre una base vacía, que es justo lo que el
 *     ejecutor sabe hacer y lo que el ensayo de §4.2 ejercita.
 *   · Lo que NO está en ningún sitio son los DATOS de los cuatro negocios. Eso
 *     es lo que este archivo vuelca.
 *
 * ── Por qué por PostgREST y no por la conexión de la aplicación ─────────────
 * `DATABASE_URL` entra como `morphiqpos_app`, y sobre las 52 relaciones hay RLS
 * con FORCE. Un `select` de ese rol sin ámbito devuelve CERO filas: el volcado
 * saldría vacío y parecería correcto. La clave de servicio salta RLS a
 * propósito, que es exactamente lo que un respaldo necesita.
 *
 * ── Por qué el volcado sale FUERA del repositorio ───────────────────────────
 * Son datos reales de cuatro negocios que cobran, y el repositorio es público.
 * El destino por omisión está fuera del árbol de git y el script se niega a
 * escribir dentro de él.
 *
 * Uso:
 *   node scripts/respaldo-logico.mjs [--destino <carpeta>]
 *   node scripts/respaldo-logico.mjs --verificar <archivo.sql>
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { consultarViva } from '../packages/data/src/verificacion/consulta-directa.ts';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const DESTINO_POR_OMISION = join(dirname(RAIZ), 'respaldos');

/**
 * Tablas que NO se vuelcan, con el motivo.
 *
 * Un respaldo que arrastra la bitácora de sesiones vivas restaura sesiones que
 * ya caducaron, y el límite de tasa restaurado castiga a alguien por peticiones
 * que hizo antes del incidente. Son tablas de estado efímero: se regeneran
 * solas y restaurarlas hace daño en vez de bien.
 */
const EFIMERAS = new Set(['sesiones', 'limite_tasa']);

/**
 * El ledger tampoco se vuelca.
 *
 * Restaurar es «aplicar las migraciones sobre una base vacia y cargar los
 * datos». El ejecutor escribe `_migraciones` el solo al aplicar; traerlo
 * ademas en el volcado choca contra su propia clave primaria y hace fallar la
 * carga entera por una tabla que ya estaba bien.
 */
const LEDGER = '_migraciones';

/**
 * Las VISTAS no se vuelcan: se derivan.
 *
 * PostgREST expone vistas igual que tablas, asi que sin esta distincion el
 * volcado traia `ordenes_pagos_resumen` y tres mas, y al restaurar intentaria
 * insertar en algo que no guarda filas. Peor: la vista de propinas es la que
 * Codex introdujo para que el desglose dejara de salir en cero — restaurarla
 * como datos seria escribir a mano el numero que ella calcula.
 */
async function relacionesQueSonTabla() {
  const respuesta = await consultarViva(
    `select c.relname as nombre
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`,
  );
  return new Set(respuesta.rows.map((fila) => String(fila.nombre)));
}

/**
 * Las columnas GENERADAS no se vuelcan: se calculan.
 *
 * `utilidad_unitaria_centavos` y sus hermanas son `generated always as`.
 * PostgREST las devuelve como una columna mas —porque leerlas es legitimo— y al
 * restaurar Postgres rechaza el `insert` entero con «cannot insert a
 * non-DEFAULT value». Volcarlas ademas seria guardar dos veces el mismo dato:
 * si el respaldo y la formula discreparan, el respaldo ganaria, y ese es
 * exactamente el error que una columna generada existe para impedir.
 */
async function columnasGeneradas() {
  const respuesta = await consultarViva(
    `select c.relname as tabla, a.attname as columna
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and a.attnum > 0
        and not a.attisdropped
        and (a.attgenerated <> '' or a.attidentity = 'a')`,
  );
  const porTabla = new Map();
  for (const fila of respuesta.rows) {
    const tabla = String(fila.tabla);
    if (!porTabla.has(tabla)) porTabla.set(tabla, new Set());
    porTabla.get(tabla).add(String(fila.columna));
  }
  return porTabla;
}

/**
 * LAS COLUMNAS QUE SON ARREGLOS de Postgres (`integer[]`, `text[]`…), con su tipo.
 *
 * PostgREST las entrega como arreglos de JSON, y `literal()` las volcaba como `jsonb`:
 * el respaldo del 24-09-2026 NO SE PODÍA RESTAURAR —`column "dia_visita" is of type
 * integer[] but expression is of type jsonb`—, y nadie lo había visto porque ningún
 * respaldo anterior se había cargado de verdad (lo destapó el ensayo con datos de la
 * 178, C.4 de la 2.4). Un arreglo de Postgres se escribe como su literal `'{…}'` con su
 * tipo; sólo `json`/`jsonb` van como JSON.
 */
async function columnasDeArreglo() {
  const respuesta = await consultarViva(
    `select c.relname as tabla, a.attname as columna,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as tipo
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       join pg_catalog.pg_attribute a on a.attrelid = c.oid
       join pg_catalog.pg_type t on t.oid = a.atttypid
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and a.attnum > 0
        and not a.attisdropped
        and t.typcategory = 'A'`,
  );
  const porTabla = new Map();
  for (const fila of respuesta.rows) {
    const tabla = String(fila.tabla);
    if (!porTabla.has(tabla)) porTabla.set(tabla, new Map());
    porTabla.get(tabla).set(String(fila.columna), String(fila.tipo));
  }
  return porTabla;
}

/** Un arreglo de JS como literal de arreglo de Postgres, con su tipo: `'{1,3}'::integer[]`. */
function literalDeArreglo(valores, tipo) {
  if (!/^[a-z][a-z0-9_ ]*(\(\d+(,\d+)?\))?\[\]$/.test(tipo)) {
    throw new Error(`Tipo de arreglo inesperado: ${tipo}`);
  }
  const elemento = (v) => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 't' : 'f';
    return `"${String(v).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  };
  return `${literal(`{${valores.map(elemento).join(',')}}`)}::${tipo}`;
}

function leerEntorno() {
  const rutas = [join(RAIZ, '.env.local'), join(RAIZ, '.env')];
  const valores = {};
  for (const ruta of rutas) {
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const limpia = linea.trim();
      if (limpia.length === 0 || limpia.startsWith('#')) continue;
      const corte = limpia.indexOf('=');
      if (corte === -1) continue;
      const clave = limpia.slice(0, corte).trim();
      if (clave in valores) continue;
      valores[clave] = limpia
        .slice(corte + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }
  return valores;
}

/** Cita un valor de JavaScript como literal de SQL. Nada se concatena sin pasar por aquí. */
function literal(valor) {
  if (valor === null || valor === undefined) return 'null';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : 'null';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (Array.isArray(valor) || typeof valor === 'object') {
    return `${literal(JSON.stringify(valor))}::jsonb`;
  }
  return `'${String(valor).replaceAll("'", "''")}'`;
}

function identificador(nombre) {
  if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) {
    throw new Error(`Nombre de tabla o columna inesperado: ${nombre}`);
  }
  return nombre;
}

async function pedir(base, clave, camino) {
  const respuesta = await fetch(`${base}/rest/v1/${camino}`, {
    headers: {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
      Accept: 'application/json',
    },
  });
  if (!respuesta.ok) {
    throw new Error(`PostgREST ${respuesta.status} en /${camino}: ${await respuesta.text()}`);
  }
  return respuesta.json();
}

async function listarTablas(base, clave) {
  const documento = await pedir(base, clave, '');
  const definiciones = documento?.definitions ?? documento?.components?.schemas ?? {};
  return Object.keys(definiciones)
    .filter((nombre) => /^[a-z_][a-z0-9_]*$/.test(nombre))
    .sort();
}

async function volcar() {
  const entorno = leerEntorno();
  const base = entorno['NEXT_PUBLIC_SUPABASE_URL'] ?? entorno['SUPABASE_URL'];
  const clave = entorno['SUPABASE_SERVICE_ROLE_KEY'];

  if (base === undefined || clave === undefined) {
    console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env');
    process.exit(2);
  }

  const indiceDestino = process.argv.indexOf('--destino');
  const destino =
    indiceDestino === -1 ? DESTINO_POR_OMISION : resolve(process.argv[indiceDestino + 1] ?? '');

  // El repositorio es publico. Un volcado dentro del arbol es un accidente a un
  // `git add -A` de distancia, asi que aqui se rechaza en vez de avisarse.
  const dentro = relative(RAIZ, destino);
  if (!dentro.startsWith('..') && !/^[A-Za-z]:/.test(dentro)) {
    console.error(`✗ El destino "${destino}" cae DENTRO del repositorio, que es publico.`);
    console.error('  Los datos de cuatro negocios que cobran no se versionan.');
    process.exit(2);
  }

  mkdirSync(destino, { recursive: true });

  const expuestas = await listarTablas(base, clave);
  const sonTabla = await relacionesQueSonTabla();
  const generadas = await columnasGeneradas();
  const arreglos = await columnasDeArreglo();
  const vistas = expuestas.filter((nombre) => !sonTabla.has(nombre));
  const tablas = expuestas.filter((nombre) => sonTabla.has(nombre) && nombre !== LEDGER);
  const partes = [];
  const manifiesto = [];

  partes.push('-- Respaldo logico de MorphiqPOS · esquema public · datos');
  partes.push('--');
  partes.push('-- Restaurar: aplicar primero las migraciones del repositorio sobre una base');
  partes.push('-- vacia (pnpm db:migrate), y despues cargar este archivo. Ver');
  partes.push('-- docs/fase-2/ROLLBACK-ACOPLE.md.');
  partes.push('--');
  partes.push(
    'set session_replication_role = replica;  -- sin disparadores ni FK durante la carga',
  );
  partes.push('begin;');

  for (const tabla of tablas) {
    if (EFIMERAS.has(tabla)) {
      manifiesto.push({ tabla, filas: 0, omitida: 'efimera' });
      continue;
    }
    const filas = await pedir(base, clave, `${identificador(tabla)}?select=*`);
    manifiesto.push({
      tabla,
      filas: filas.length,
      ...(generadas.has(tabla) ? { generadas: [...generadas.get(tabla)] } : {}),
    });
    if (filas.length === 0) continue;

    const calculadas = generadas.get(tabla) ?? new Set();
    const columnas = Object.keys(filas[0])
      .filter((columna) => !calculadas.has(columna))
      .map(identificador);
    partes.push('');
    partes.push(`-- ${tabla}: ${filas.length} fila(s)`);
    for (const fila of filas) {
      const deArreglo = arreglos.get(tabla) ?? new Map();
      const valores = columnas.map((columna) =>
        Array.isArray(fila[columna]) && deArreglo.has(columna)
          ? literalDeArreglo(fila[columna], deArreglo.get(columna))
          : literal(fila[columna]),
      );
      partes.push(
        `insert into public.${identificador(tabla)} (${columnas.join(', ')}) values (${valores.join(', ')});`,
      );
    }
  }

  partes.push('');
  partes.push('commit;');
  partes.push('set session_replication_role = origin;');
  partes.push('');

  const sql = partes.join('\n');
  const fecha = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
  const archivo = join(destino, `morphiqpos-${fecha}.sql`);
  writeFileSync(archivo, sql, 'utf8');

  const conFilas = manifiesto.filter((m) => m.filas > 0);
  const total = manifiesto.reduce((suma, m) => suma + m.filas, 0);
  const huella = createHash('sha256').update(sql).digest('hex');

  writeFileSync(
    `${archivo}.manifiesto.json`,
    `${JSON.stringify({ archivo, fecha, sha256: huella, total, tablas: manifiesto }, null, 2)}\n`,
    'utf8',
  );

  console.log(`✓ Respaldo escrito en ${archivo}`);
  console.log(`  ${statSync(archivo).size} bytes · sha256 ${huella.slice(0, 16)}…`);
  console.log(`  ${tablas.length} tablas miradas · ${conFilas.length} con filas · ${total} filas`);
  console.log(`  Omitidas a proposito · efimeras: ${[...EFIMERAS].join(', ')}`);
  console.log(`  Omitidas a proposito · el ledger: ${LEDGER}`);
  console.log(`  Omitidas a proposito · ${vistas.length} vistas: ${vistas.join(', ')}`);
  for (const m of conFilas) console.log(`    ${m.tabla.padEnd(32)} ${m.filas}`);
}

function verificar() {
  const archivo = resolve(process.argv[process.argv.indexOf('--verificar') + 1] ?? '');
  if (!existsSync(archivo)) {
    console.error(`✗ No existe ${archivo}`);
    process.exit(2);
  }
  const sql = readFileSync(archivo, 'utf8');
  const manifiesto = JSON.parse(readFileSync(`${archivo}.manifiesto.json`, 'utf8'));
  const huella = createHash('sha256').update(sql).digest('hex');
  const inserts = (sql.match(/^insert into public\./gm) ?? []).length;

  const fallos = [];
  if (huella !== manifiesto.sha256) fallos.push('el sha256 no coincide con el manifiesto');
  if (inserts !== manifiesto.total) {
    fallos.push(`el archivo trae ${inserts} inserts y el manifiesto dice ${manifiesto.total}`);
  }
  if (!sql.includes('commit;')) fallos.push('el archivo no termina en commit');

  if (fallos.length > 0) {
    console.error('✗ El respaldo no cuadra:');
    for (const fallo of fallos) console.error(`  · ${fallo}`);
    process.exit(1);
  }
  console.log(`✓ ${archivo}: ${inserts} inserts, sha256 coincide con el manifiesto.`);
}

if (process.argv.includes('--verificar')) verificar();
else await volcar();
