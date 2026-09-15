#!/usr/bin/env node
/**
 * Genera `src/esquema.ts` desde la base YA MIGRADA (F1.1-T03).
 *
 *   pnpm db:tipos
 *
 * Los tipos NO se escriben a mano. Esa es la mitad del ADR 0001: el esquema
 * vive entero en los `.sql`, la base es la autoridad, y los tipos son un
 * reflejo suyo. Un tipo escrito a mano se desincroniza en la primera migración
 * que a alguien se le olvide propagar, y a partir de ahí el compilador da
 * garantías falsas — que es peor que no dar ninguna.
 *
 * La consulta que produce el TypeScript vive AQUÍ y se ejecuta tal cual, sea
 * por este script o por cualquier otro camino que llegue a la misma base. Si
 * el mapeo de tipos viviera en JavaScript y la consulta sólo trajera metadatos,
 * habría dos sitios donde equivocarse.
 *
 * El mapeo refleja los parsers de `cliente.ts`. Si cambia uno, cambia el otro:
 *
 *   int8      → bigint   (dinero en centavos, R15)
 *   numeric   → string   (cantidades de inventario, hasta 4 decimales)
 *   date      → string   (día del calendario, no instante)
 *   jsonb     → unknown  (obliga a validar con zod antes de usarlo)
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

/**
 * El `.env` vive en la RAÍZ del monorepo, no junto a cada paquete.
 *
 * Cargarlo por ruta relativa al cwd hacía que `pnpm -r db:tipos` no lo
 * encontrara: turbo ejecuta el script con el cwd en `packages/data` y desde
 * ahí `.env` no existe. El síntoma era «Falta DATABASE_URL» con la variable
 * perfectamente puesta, que es de los errores que más tiempo hacen perder.
 */
config({
  path: [
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env.local'),
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env'),
    '.env.local',
    '.env',
  ],
  quiet: true,
});

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const DESTINO = join(AQUI, '..', 'src', 'esquema.ts');

/**
 * Devuelve el contenido completo de `esquema.ts` como un solo valor de texto.
 *
 * Se exporta para que el mismo SQL se pueda ejecutar por otra vía cuando no hay
 * `DATABASE_URL` a mano —por ejemplo desde una consola administrada— y el
 * resultado sea idéntico byte a byte.
 */
export const CONSULTA = /* sql */ `
with columnas as (
  select c.table_name as tabla,
         c.ordinal_position as pos,
         c.column_name as columna,
         c.udt_name as tipo_pg,
         c.is_nullable = 'YES' as nulo,
         c.column_default is not null or c.is_identity = 'YES' as generada
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public'
     and t.table_type = 'BASE TABLE'
     -- El ledger de migraciones lo posee el ejecutor, no el dominio.
     and c.table_name <> '_migraciones'
),
mapeadas as (
  select tabla, pos, columna, generada, nulo,
         case tipo_pg
           when 'uuid'        then 'string'
           when 'text'        then 'string'
           when 'varchar'     then 'string'
           when 'bpchar'      then 'string'
           when 'inet'        then 'string'
           when 'bool'        then 'boolean'
           when 'int2'        then 'number'
           when 'int4'        then 'number'
           when 'int8'        then 'bigint'
           when 'numeric'     then 'string'
           when 'float4'      then 'number'
           when 'float8'      then 'number'
           when 'date'        then 'string'
           when 'timestamptz' then 'Date'
           when 'timestamp'   then 'Date'
           when 'jsonb'       then 'unknown'
           when 'json'        then 'unknown'
           else '__TIPO_SIN_MAPEAR_' || tipo_pg || '__'
         end as tipo_ts
    from columnas
),
lineas as (
  select tabla, pos,
         '  ' || columna || ': ' ||
         case
           -- El tipo "unknown" ya incluye null, asi que "unknown | null" es
           -- redundante y el lint lo rechaza. Es el unico caso del mapeo.
           when tipo_ts = 'unknown' and generada then 'Generated<unknown>'
           when tipo_ts = 'unknown'              then 'unknown'
           when generada and nulo then 'Generated<' || tipo_ts || ' | null>'
           when generada          then 'Generated<' || tipo_ts || '>'
           when nulo              then tipo_ts || ' | null'
           else tipo_ts
         end || ';' as linea
    from mapeadas
),
interfaces as (
  select tabla,
         'export interface ' ||
         -- snake_case → PascalCase
         (select string_agg(initcap(p), '') from unnest(string_to_array(tabla, '_')) p) ||
         ' {' || chr(10) ||
         string_agg(linea, chr(10) order by pos) || chr(10) || '}' as bloque
    from lineas
   group by tabla
),
mapa as (
  select string_agg('  ' || tabla || ': ' ||
           (select string_agg(initcap(p), '') from unnest(string_to_array(tabla, '_')) p) ||
           ';', chr(10) order by tabla) as filas
    from interfaces
)
select
  '/**' || chr(10) ||
  ' * Tipos del esquema de la base.' || chr(10) ||
  ' *' || chr(10) ||
  ' * ARCHIVO GENERADO por \`pnpm db:tipos\` (packages/data/bin/generar-tipos.mjs).' || chr(10) ||
  ' * NO se edita a mano: se regenera desde la base ya migrada. Una edicion manual' || chr(10) ||
  ' * sobrevive hasta la siguiente regeneracion y, mientras tanto, hace que el' || chr(10) ||
  ' * compilador afirme cosas que la base no cumple.' || chr(10) ||
  ' *' || chr(10) ||
  ' * \`Generated<T>\` marca las columnas con valor por omision: opcionales al' || chr(10) ||
  ' * insertar, siempre presentes al leer.' || chr(10) ||
  ' */' || chr(10) ||
  'import type { Generated } from ''kysely'';' || chr(10) || chr(10) ||
  (select string_agg(bloque, chr(10) || chr(10) order by tabla) from interfaces) ||
  chr(10) || chr(10) ||
  'export interface Esquema {' || chr(10) ||
  (select filas from mapa) || chr(10) ||
  '}' || chr(10)
  as fuente;
`;

function fuenteDeRespuestaVinculada(salida) {
  const inicio = salida.indexOf('{');
  const fin = salida.lastIndexOf('}');
  if (inicio < 0 || fin < inicio) throw new Error('El CLI no devolvió JSON reconocible.');

  const respuesta = JSON.parse(salida.slice(inicio, fin + 1));
  if (typeof respuesta !== 'object' || respuesta === null) return undefined;
  const filas = respuesta.rows;
  if (!Array.isArray(filas)) return undefined;
  const primera = filas[0];
  if (typeof primera !== 'object' || primera === null) return undefined;
  return typeof primera.fuente === 'string' ? primera.fuente : undefined;
}

async function fuenteDesdeBase() {
  const url = process.env['DATABASE_URL'];
  if (url !== undefined && url !== '') {
    const { obtenerPool, cerrarDb } = await import('../src/cliente.ts');
    try {
      const { rows } = await obtenerPool().query(CONSULTA);
      return rows[0]?.fuente;
    } finally {
      await cerrarDb();
    }
  }

  const projectRef = process.env['MORPHIQPOS_SUPABASE_PROJECT_REF'];
  if (projectRef === undefined || !/^[a-z]{20}$/.test(projectRef)) {
    throw new Error(
      'Falta DATABASE_URL o MORPHIQPOS_SUPABASE_PROJECT_REF válido. Sin base migrada no hay tipos que generar.',
    );
  }

  const ejecutable = process.env['SUPABASE_CLI_PATH'] ?? 'supabase';
  const carpeta = mkdtempSync(join(tmpdir(), 'morphiqpos-tipos-'));
  const archivo = join(carpeta, 'generar-tipos.sql');
  writeFileSync(archivo, CONSULTA, 'utf8');

  try {
    // Equivale a `supabase db query --linked`: la referencia explícita impide
    // generar contra otro proyecto guardado en la máquina.
    const resultado = spawnSync(
      ejecutable,
      [
        'db',
        'query',
        '--linked',
        '--project-ref',
        projectRef,
        '--output-format',
        'json',
        '--file',
        archivo,
      ],
      { cwd: RAIZ, encoding: 'utf8', windowsHide: true },
    );
    if (resultado.error !== undefined) throw resultado.error;
    if (resultado.status !== 0) {
      throw new Error(
        resultado.stderr.trim() || `Supabase CLI terminó con ${String(resultado.status)}.`,
      );
    }
    return fuenteDeRespuestaVinculada(resultado.stdout);
  } finally {
    rmSync(carpeta, { force: true, recursive: true });
  }
}

try {
  const fuente = await fuenteDesdeBase();

  if (typeof fuente !== 'string' || fuente.length === 0) {
    throw new Error('La consulta no devolvió fuente. ¿La base está migrada?');
  }
  if (fuente.includes('__TIPO_SIN_MAPEAR_')) {
    const sinMapear = [...fuente.matchAll(/__TIPO_SIN_MAPEAR_(\w+?)__/g)].map((m) => m[1]);
    throw new Error(
      `Tipos de Postgres sin mapear: ${[...new Set(sinMapear)].join(', ')}.\n` +
        'Añádelos a CONSULTA junto con su parser en cliente.ts. No se genera un\n' +
        'esquema a medias: `any` disfrazado es peor que un fallo.',
    );
  }

  writeFileSync(DESTINO, fuente, 'utf8');
  const tablas = (fuente.match(/^export interface /gm) ?? []).length - 1;
  console.log(`✓ src/esquema.ts regenerado desde la base: ${tablas} tablas.`);
} catch (error) {
  console.error('\n✗ No se pudieron generar los tipos.\n');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
