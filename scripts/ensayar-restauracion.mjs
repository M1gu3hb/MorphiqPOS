#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PROYECTO_MORPHIQPOS = 'wyqmzhliurwyxuyxznpb';
const proyecto = process.env['MORPHIQPOS_SUPABASE_PROJECT_REF'];
const CLI =
  process.env['SUPABASE_CLI_PATH'] ?? (process.platform === 'win32' ? 'supabase.exe' : 'supabase');
const PG_BIN =
  process.env['MORPHIQPOS_PG_BIN'] ??
  (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
const PNPM =
  process.platform === 'win32'
    ? join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js')
    : 'pnpm';
const ARGUMENTOS_MIGRACION = ['db:migrate'];

if (proyecto !== PROYECTO_MORPHIQPOS) {
  throw new Error(
    `Ensayo cancelado: MORPHIQPOS_SUPABASE_PROJECT_REF debe ser ${PROYECTO_MORPHIQPOS}.`,
  );
}

const SQL_RESPALDO = String.raw`
create temporary table morphiqpos_respaldo (
  tabla text primary key,
  filas bigint not null,
  checksum text not null,
  sentencia text not null
);

do $morphiqpos$
declare
  relacion record;
  columnas text;
  expresiones text;
  cantidad bigint;
  huella text;
  valores text;
begin
  for relacion in
    select c.relname as tabla
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    select
      string_agg(format('%I', a.attname), ', ' order by a.attnum),
      string_agg(format('quote_nullable(t.%I::text)', a.attname), ' || '','' || ' order by a.attnum)
    into columnas, expresiones
    from pg_catalog.pg_attribute a
    where a.attrelid = format('public.%I', relacion.tabla)::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attgenerated = '';

    execute format(
      $consulta$
        select
          count(*)::bigint,
          md5(coalesce(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text), '')),
          string_agg('(' || %s || ')', E',\n' order by to_jsonb(t)::text)
        from public.%I t
      $consulta$,
      expresiones,
      relacion.tabla
    ) into cantidad, huella, valores;

    insert into morphiqpos_respaldo (tabla, filas, checksum, sentencia)
    values (
      relacion.tabla,
      cantidad,
      huella,
      case
        when cantidad = 0 then ''
        else format(
          E'insert into public.%I (%s) overriding system value values\n%s;',
          relacion.tabla,
          columnas,
          valores
        )
      end
    );
  end loop;
end
$morphiqpos$;

select json_build_object(
  'creadoEn', now(),
  'tablas', json_agg(
    json_build_object(
      'tabla', tabla,
      'filas', filas,
      'checksum', checksum,
      'sentencia', sentencia
    ) order by tabla
  )
) as respaldo
from morphiqpos_respaldo;
`;

const SQL_VERIFICACION = String.raw`
create temporary table morphiqpos_verificacion (
  tabla text primary key,
  filas bigint not null,
  checksum text not null
);

do $morphiqpos$
declare
  relacion record;
  cantidad bigint;
  huella text;
begin
  for relacion in
    select c.relname as tabla
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  loop
    execute format(
      $consulta$
        select
          count(*)::bigint,
          md5(coalesce(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text), ''))
        from public.%I t
      $consulta$,
      relacion.tabla
    ) into cantidad, huella;
    insert into morphiqpos_verificacion values (relacion.tabla, cantidad, huella);
  end loop;
end
$morphiqpos$;

select coalesce(
  json_object_agg(tabla, json_build_object('filas', filas, 'checksum', checksum) order by tabla),
  '{}'::json
)::text
from morphiqpos_verificacion;
`;

function ejecutable(nombre) {
  if (PG_BIN === '') return nombre;
  return join(PG_BIN, process.platform === 'win32' ? `${nombre}.exe` : nombre);
}

function ejecutar(comando, argumentos, opciones = {}) {
  const resultado = spawnSync(comando, argumentos, {
    cwd: RAIZ,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
    ...opciones,
  });
  if (resultado.error !== undefined) throw resultado.error;
  if (resultado.status !== 0) {
    const detalle = (resultado.stderr ?? '').trim();
    throw new Error(
      `${comando} termino con ${String(resultado.status)}${detalle === '' ? '' : `: ${detalle}`}`,
    );
  }
  return resultado.stdout ?? '';
}

function leerRespaldo(salida) {
  const documento = JSON.parse(salida);
  const respaldo = documento?.rows?.[0]?.respaldo;
  if (typeof respaldo !== 'object' || respaldo === null || !Array.isArray(respaldo.tablas)) {
    throw new Error('Supabase CLI devolvio un respaldo con formato invalido.');
  }
  return respaldo;
}

function mapaEsperado(respaldo) {
  return Object.fromEntries(
    respaldo.tablas.map((tabla) => [
      tabla.tabla,
      { filas: Number(tabla.filas), checksum: tabla.checksum },
    ]),
  );
}

function compararVerificacion(esperado, obtenido) {
  const diferencias = [];
  for (const [tabla, datos] of Object.entries(esperado)) {
    const real = obtenido[tabla];
    if (real === undefined) {
      diferencias.push(`${tabla}: ausente`);
    } else if (Number(real.filas) !== datos.filas || real.checksum !== datos.checksum) {
      diferencias.push(`${tabla}: filas o checksum distintos`);
    }
  }
  for (const tabla of Object.keys(obtenido)) {
    if (!(tabla in esperado)) diferencias.push(`${tabla}: tabla inesperada`);
  }
  if (diferencias.length > 0) {
    throw new Error(`La restauracion no coincide:\n${diferencias.join('\n')}`);
  }
}

function escribirExtensionCron(carpeta) {
  writeFileSync(
    join(carpeta, 'pg_cron.control'),
    "comment = 'Contrato local para ensayar la migracion de retencion'\ndefault_version = '1.0'\nschema = 'pg_catalog'\nrelocatable = false\n",
    'utf8',
  );
  writeFileSync(
    join(carpeta, 'pg_cron--1.0.sql'),
    String.raw`
create schema if not exists cron;
create table cron.job (
  jobid bigint generated by default as identity primary key,
  schedule text not null,
  command text not null,
  jobname text not null unique,
  active boolean not null default true
);
create function cron.schedule(nombre text, calendario text, instruccion text)
returns bigint
language sql
as $$
  insert into cron.job (jobname, schedule, command)
  values (nombre, calendario, instruccion)
  on conflict (jobname) do update
    set schedule = excluded.schedule, command = excluded.command, active = true
  returning jobid
$$;
`,
    'utf8',
  );
}

const carpeta = mkdtempSync(join(tmpdir(), 'morphiqpos-restauracion-'));
const datos = join(carpeta, 'postgres');
const extensiones = join(carpeta, 'extensiones');
const controlesExtension = join(extensiones, 'extension');
const consultaRespaldo = join(carpeta, 'respaldo.sql');
const archivoRestauracion = join(carpeta, 'restaurar.sql');
const bitacoraPostgres = join(carpeta, 'postgres.log');
const puerto = 55_000 + Math.floor(Math.random() * 1_000);
const urlLocal = `postgresql://postgres@127.0.0.1:${String(puerto)}/morphiqpos_restauracion`;
let postgresLevantado = false;

const inicioTotal = performance.now();
try {
  if (!existsSync(ejecutable('initdb'))) {
    throw new Error(`No se encontro PostgreSQL en ${PG_BIN}. Define MORPHIQPOS_PG_BIN.`);
  }

  writeFileSync(consultaRespaldo, SQL_RESPALDO, 'utf8');
  const inicioRespaldo = performance.now();
  const salida = ejecutar(CLI, [
    'db',
    'query',
    '--output-format',
    'json',
    '--linked',
    '--project-ref',
    proyecto,
    '--file',
    consultaRespaldo,
  ]);
  const respaldo = leerRespaldo(salida);
  const respaldoMs = Math.round(performance.now() - inicioRespaldo);

  writeFileSync(
    archivoRestauracion,
    [
      'begin;',
      'set local session_replication_role = replica;',
      "do $limpiar$ declare r record; begin for r in select tablename from pg_tables where schemaname = 'public' loop execute format('truncate table public.%I cascade', r.tablename); end loop; end $limpiar$;",
      ...respaldo.tablas.map((tabla) => tabla.sentencia).filter((sql) => sql !== ''),
      'commit;',
    ].join('\n'),
    'utf8',
  );
  const bytes = Buffer.byteLength(salida, 'utf8');

  const inicioPreparacion = performance.now();
  rmSync(extensiones, { force: true, recursive: true });
  mkdirSync(controlesExtension, { recursive: true });
  escribirExtensionCron(controlesExtension);
  ejecutar(ejecutable('initdb'), [
    '-D',
    datos,
    '-U',
    'postgres',
    '-A',
    'trust',
    '--encoding=UTF8',
    '--locale=C',
  ]);
  const rutaExtensiones = extensiones.replaceAll('\\', '/');
  const separador = process.platform === 'win32' ? ';' : ':';
  const opcionesPostgres =
    `-p ${String(puerto)} -h 127.0.0.1 -c timezone=UTC ` +
    `-c "extension_control_path=${rutaExtensiones}${separador}$system"`;
  ejecutar(
    ejecutable('pg_ctl'),
    ['-D', datos, '-l', bitacoraPostgres, '-o', opcionesPostgres, '-w', 'start'],
    { stdio: 'ignore' },
  );
  postgresLevantado = true;
  ejecutar(ejecutable('createdb'), [
    '-h',
    '127.0.0.1',
    '-p',
    String(puerto),
    '-U',
    'postgres',
    'morphiqpos_restauracion',
  ]);
  ejecutar(
    process.platform === 'win32' ? process.execPath : PNPM,
    [...(process.platform === 'win32' ? [PNPM] : []), ...ARGUMENTOS_MIGRACION],
    {
      env: {
        ...process.env,
        DATABASE_URL: urlLocal,
        MORPHIQPOS_SUPABASE_PROJECT_REF: '',
      },
    },
  );
  const preparacionMs = Math.round(performance.now() - inicioPreparacion);

  const inicioRestauracion = performance.now();
  ejecutar(ejecutable('psql'), [urlLocal, '-v', 'ON_ERROR_STOP=1', '-f', archivoRestauracion]);
  const restauracionMs = Math.round(performance.now() - inicioRestauracion);

  const inicioValidacion = performance.now();
  const salidaValidacion = ejecutar(ejecutable('psql'), [
    urlLocal,
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
    '-t',
    '-A',
    '-c',
    SQL_VERIFICACION,
  ]).trim();
  compararVerificacion(mapaEsperado(respaldo), JSON.parse(salidaValidacion));
  const validacionMs = Math.round(performance.now() - inicioValidacion);
  const totalMs = Math.round(performance.now() - inicioTotal);
  const totalFilas = respaldo.tablas.reduce((total, tabla) => total + Number(tabla.filas), 0);

  console.log(
    JSON.stringify({
      proyectoFuente: proyecto,
      destino: 'PostgreSQL temporal aislado',
      creadoEn: respaldo.creadoEn,
      tablas: respaldo.tablas.length,
      filas: totalFilas,
      bytesRespaldoJson: bytes,
      respaldoMs,
      preparacionMs,
      restauracionMs,
      validacionMs,
      totalMs,
      verificacion: 'filas y checksum por tabla coinciden',
    }),
  );
} finally {
  if (postgresLevantado) {
    spawnSync(ejecutable('pg_ctl'), ['-D', datos, '-m', 'fast', '-w', 'stop'], {
      cwd: RAIZ,
      encoding: 'utf8',
      stdio: 'ignore',
      windowsHide: true,
    });
  }
  rmSync(carpeta, { force: true, recursive: true });
}
