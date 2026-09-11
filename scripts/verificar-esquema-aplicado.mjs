#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diferenciasDeContrato } from '../packages/data/src/verificacion/contrato-esquema.ts';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTRATO = join(RAIZ, 'scripts', 'esquema-esperado.json');
const PROYECTO_VINCULADO = join(RAIZ, 'supabase', '.temp', 'linked-project.json');
const PROYECTO_MORPHIQPOS = 'wyqmzhliurwyxuyxznpb';

const CONSULTA = String.raw`
with tablas as (
  select c.oid, n.nspname as esquema, c.relname as tabla
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname <> '_migraciones'
), columnas as (
  select
    format('%s.%s.%s', t.esquema, t.tabla, a.attname) as clave,
    t.esquema,
    t.tabla,
    a.attname as columna,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as tipo,
    a.attnotnull as "noNula",
    pg_catalog.pg_get_expr(d.adbin, d.adrelid) as "defaultSql",
    nullif(a.attidentity, '') as identidad,
    nullif(a.attgenerated, '') as generada
  from tablas t
  join pg_catalog.pg_attribute a on a.attrelid = t.oid
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped
), restricciones as (
  select
    format('%s.%s.%s', t.esquema, t.tabla, c.conname) as clave,
    t.esquema,
    t.tabla,
    c.conname as nombre,
    case c.contype
      when 'c' then 'check'
      when 'f' then 'foreign_key'
      when 'p' then 'primary_key'
      when 'u' then 'unique'
      when 'x' then 'exclude'
    end as tipo,
    pg_catalog.pg_get_constraintdef(c.oid, true) as definicion,
    c.convalidated as validada,
    c.condeferrable as diferible,
    c.condeferred as "diferidaInicialmente"
  from tablas t
  join pg_catalog.pg_constraint c on c.conrelid = t.oid
  where c.contype in ('c', 'f', 'p', 'u', 'x')
), indices as (
  select
    format('%s.%s.%s', t.esquema, t.tabla, i.relname) as clave,
    t.esquema,
    t.tabla,
    i.relname as nombre,
    x.indisunique as unico,
    x.indisprimary as primario,
    x.indisvalid as valido,
    pg_catalog.pg_get_indexdef(i.oid) as definicion
  from tablas t
  join pg_catalog.pg_index x on x.indrelid = t.oid
  join pg_catalog.pg_class i on i.oid = x.indexrelid
)
select json_build_object(
  'columnas', coalesce(
    (select json_agg(row_to_json(c) order by c.clave) from columnas c),
    '[]'::json
  ),
  'restricciones', coalesce(
    (select json_agg(row_to_json(r) order by r.clave) from restricciones r),
    '[]'::json
  ),
  'indices', coalesce(
    (select json_agg(row_to_json(i) order by i.clave) from indices i),
    '[]'::json
  )
) as contrato;
`;

function referenciaVinculada() {
  const declarada = process.env['MORPHIQPOS_SUPABASE_PROJECT_REF'];
  if (declarada !== undefined && declarada !== '') return declarada;
  if (!existsSync(PROYECTO_VINCULADO)) {
    throw new Error('Falta MORPHIQPOS_SUPABASE_PROJECT_REF y no existe un vínculo local.');
  }

  const vinculada = JSON.parse(readFileSync(PROYECTO_VINCULADO, 'utf8'));
  if (typeof vinculada !== 'object' || vinculada === null || !('ref' in vinculada)) {
    throw new Error('El vínculo local de Supabase no contiene una referencia válida.');
  }
  return vinculada.ref;
}

function validarProyecto() {
  const referencia = referenciaVinculada();
  if (referencia !== PROYECTO_MORPHIQPOS) {
    throw new Error(`Verificación cancelada: la referencia debe ser ${PROYECTO_MORPHIQPOS}.`);
  }
  return referencia;
}

function leerContratoReal() {
  const proyecto = validarProyecto();
  const cli = process.env['SUPABASE_CLI_PATH'] ?? 'supabase';
  const carpeta = mkdtempSync(join(tmpdir(), 'morphiqpos-contrato-'));
  const archivo = join(carpeta, 'contrato.sql');
  writeFileSync(archivo, CONSULTA, 'utf8');

  try {
    const resultado = spawnSync(
      cli,
      [
        'db',
        'query',
        '--output-format',
        'json',
        '--linked',
        '--project-ref',
        proyecto,
        '--file',
        archivo,
      ],
      { cwd: RAIZ, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, windowsHide: true },
    );
    if (resultado.error !== undefined) throw resultado.error;
    if (resultado.status !== 0) {
      const detalle = [resultado.stderr.trim(), resultado.stdout.trim()].filter(Boolean).join('\n');
      throw new Error(`Supabase CLI no pudo leer el esquema: ${detalle}`);
    }

    const respuesta = JSON.parse(resultado.stdout);
    const contrato = respuesta?.rows?.[0]?.contrato;
    if (
      typeof contrato !== 'object' ||
      contrato === null ||
      !Array.isArray(contrato.columnas) ||
      !Array.isArray(contrato.restricciones) ||
      !Array.isArray(contrato.indices)
    ) {
      throw new Error('Supabase CLI devolvió un contrato de esquema inválido.');
    }
    return contrato;
  } finally {
    rmSync(carpeta, { force: true, recursive: true });
  }
}

try {
  const real = leerContratoReal();
  if (process.argv.includes('--actualizar')) {
    writeFileSync(CONTRATO, `${JSON.stringify(real, null, 2)}\n`, 'utf8');
    console.log(
      `✓ Contrato actualizado: ${real.columnas.length} columnas, ` +
        `${real.restricciones.length} restricciones y ${real.indices.length} índices.`,
    );
  } else {
    if (!existsSync(CONTRATO)) {
      throw new Error(
        'Falta scripts/esquema-esperado.json. Ejecute verify:esquema -- --actualizar.',
      );
    }
    const esperado = JSON.parse(readFileSync(CONTRATO, 'utf8'));
    const diferencias = diferenciasDeContrato(esperado, real);
    if (diferencias.length > 0) {
      throw new Error(
        `${diferencias.length} diferencia(s) entre el contrato y la base:\n` +
          diferencias.map((diferencia) => `  - ${diferencia}`).join('\n'),
      );
    }
    console.log(
      `✓ La base cumple el contrato: ${real.columnas.length} columnas, ` +
        `${real.restricciones.length} restricciones y ${real.indices.length} índices.`,
    );
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
