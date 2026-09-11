#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { problemasDeSeguridad } from '../packages/data/src/verificacion/rls.ts';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PROYECTO_VINCULADO = join(RAIZ, 'supabase', '.temp', 'linked-project.json');
const PROYECTO_MORPHIQPOS = 'wyqmzhliurwyxuyxznpb';

const CONSULTA = String.raw`
with relaciones as (
  select
    format('%I.%I', n.nspname, c.relname) as clave,
    case c.relkind
      when 'r' then 'tabla'
      when 'p' then 'tabla_particionada'
      when 'v' then 'vista'
      when 'm' then 'vista_materializada'
    end as tipo,
    case when c.relkind in ('r', 'p') then c.relrowsecurity else null end as "rlsActiva",
    case when c.relkind in ('r', 'p') then c.relforcerowsecurity else null end as "rlsForzada",
    has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT') as "selectAnon",
    has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT')
      as "selectAuthenticated"
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
), indices as (
  select
    i.relname as nombre,
    x.indisunique as unico,
    x.indisvalid as valido
  from pg_catalog.pg_index x
  join pg_catalog.pg_class i on i.oid = x.indexrelid
  join pg_catalog.pg_class t on t.oid = x.indrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
)
select json_build_object(
  'relaciones', coalesce(
    (select json_agg(row_to_json(r) order by r.clave) from relaciones r),
    '[]'::json
  ),
  'indices', coalesce(
    (select json_agg(row_to_json(i) order by i.nombre) from indices i),
    '[]'::json
  )
) as estado;
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

function leerEstado() {
  const proyecto = referenciaVinculada();
  if (proyecto !== PROYECTO_MORPHIQPOS) {
    throw new Error(`Verificación cancelada: la referencia debe ser ${PROYECTO_MORPHIQPOS}.`);
  }

  const cli = process.env['SUPABASE_CLI_PATH'] ?? 'supabase';
  const carpeta = mkdtempSync(join(tmpdir(), 'morphiqpos-rls-'));
  const archivo = join(carpeta, 'verificar-rls.sql');
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
      throw new Error(`Supabase CLI no pudo leer RLS y grants: ${detalle}`);
    }

    const respuesta = JSON.parse(resultado.stdout);
    const estado = respuesta?.rows?.[0]?.estado;
    if (
      typeof estado !== 'object' ||
      estado === null ||
      !Array.isArray(estado.relaciones) ||
      !Array.isArray(estado.indices)
    ) {
      throw new Error('Supabase CLI devolvió un estado de seguridad inválido.');
    }
    return estado;
  } finally {
    rmSync(carpeta, { force: true, recursive: true });
  }
}

try {
  const estado = leerEstado();
  const problemas = problemasDeSeguridad(estado);
  if (problemas.length > 0) {
    throw new Error(
      `${problemas.length} problema(s) de RLS, grants o índices:\n` +
        problemas.map((problema) => `  - ${problema}`).join('\n'),
    );
  }
  console.log(
    `✓ RLS y grants cerrados en ${estado.relaciones.length} relaciones; índices 046 presentes.`,
  );
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
