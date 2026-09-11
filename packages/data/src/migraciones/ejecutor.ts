import 'server-only';

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

import { obtenerPool } from '../cliente.ts';
import { leerMigraciones, type Migracion } from './lectura.ts';

const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url));

// La lectura del disco vive en `lectura.ts`, sin dependencias de servidor. Se
// reexporta para que quien importe el ejecutor no tenga que saberlo.
export { leerMigraciones, type Migracion };

/**
 * Ejecutor de migraciones (F1.1-T01).
 *
 * Las migraciones son archivos `.sql` numerados. Kysely no las genera ni las
 * posee: el esquema vive entero en SQL, que es exactamente la razón por la que
 * se eligió Kysely sobre Drizzle (ADR 0001, requisito 10 — una sola fuente de
 * verdad del esquema).
 *
 * Reglas que este ejecutor hace cumplir:
 *
 *   1. **Forward-only.** No hay `down`. Un error se corrige con una migración
 *      nueva, no editando una ya aplicada.
 *   2. **Todo o nada.** La tanda entera corre en UNA transacción: si la tercera
 *      migración falla, las dos anteriores se revierten y la base queda en el
 *      estado en que estaba. Postgres tiene DDL transaccional, así que esto es
 *      real y no una aproximación.
 *   3. **El hash del contenido se guarda en el ledger.** Editar una migración
 *      aplicada es un error, no un aviso: en producción esa edición nunca se
 *      ejecutó, así que el código y la base habrían divergido en silencio
 *      (`supabase-vercel-produccion §3`).
 *   4. **El orden es el del prefijo numérico**, nunca el del sistema de archivos.
 *
 * Se usa el cliente crudo de `pg` en vez de Kysely por una razón técnica: Kysely
 * envía por el protocolo extendido, que admite **una sola sentencia por mensaje**,
 * y un archivo de migración tiene decenas.
 */

const LEDGER = `
  create table if not exists _migraciones (
    version      integer      primary key,
    nombre       text         not null,
    hash         text         not null,
    aplicada_en  timestamptz  not null default now(),
    duracion_ms  integer      not null
  )
`;

export interface ResultadoMigracion {
  readonly aplicadas: readonly string[];
  readonly yaEstaban: number;
  readonly ensayo: boolean;
}

function literalSql(valor: string): string {
  return `'${valor.replaceAll("'", "''")}'`;
}

/**
 * Construye el único mensaje que el transporte vinculado entrega a Postgres.
 * El SQL y el ledger viajan en la misma transacción también cuando no hay una
 * contraseña de conexión disponible y el CLI usa la Management API.
 */
export function prepararTandaVinculada(pendientes: readonly Migracion[], ensayo: boolean): string {
  const partes = ['begin;'];

  for (const migracion of pendientes) {
    partes.push(migracion.sql);
    partes.push(
      'insert into _migraciones (version, nombre, hash, duracion_ms) values ' +
        `(${migracion.version}, ${literalSql(migracion.nombre)}, ${literalSql(migracion.hash)}, 0);`,
    );
  }

  partes.push(ensayo ? 'rollback;' : 'commit;');
  return partes.join('\n');
}

/** Compara lo que hay en disco con lo que dice el ledger y lanza si divergen. */
function comprobarIntegridad(
  enDisco: readonly Migracion[],
  registradas: readonly { version: number; nombre: string; hash: string }[],
): void {
  const porVersion = new Map(registradas.map((fila) => [fila.version, fila]));

  for (const migracion of enDisco) {
    const registrada = porVersion.get(migracion.version);
    if (registrada !== undefined && registrada.hash !== migracion.hash) {
      throw new Error(
        [
          `La migración ${migracion.archivo} cambió después de haberse aplicado.`,
          '',
          '  Las migraciones son forward-only: en producción esa edición nunca se',
          '  ejecutó, así que el código y la base ya divergieron en silencio.',
          '',
          '  Corrige con una migración NUEVA que lleve la base al estado que quieres.',
        ].join('\n'),
      );
    }
  }

  for (const registrada of registradas) {
    if (!enDisco.some((m) => m.version === registrada.version)) {
      throw new Error(
        `La base tiene aplicada la migración ${registrada.version} ("${registrada.nombre}") y ` +
          'ese archivo no está en el repositorio. O alguien lo borró, o esta base pertenece ' +
          'a otra rama.',
      );
    }
  }
}

/**
 * Aplica las migraciones pendientes.
 *
 * @param opciones.ensayo  Aplica **toda la tanda** y hace `ROLLBACK` al final.
 *   Comprueba que el SQL es válido contra la base real sin escribir nada, que es
 *   la práctica que pide `supabase-vercel-produccion §3`. Se ensaya la cadena
 *   completa, no migración por migración: la 002 suele depender de la 001.
 */
interface FilaLedger {
  readonly version: number;
  readonly nombre: string;
  readonly hash: string;
}

interface OpcionesVinculadas {
  readonly projectRef: string;
  readonly cliPath?: string;
  readonly ensayo?: boolean;
}

function ejecutarConsultaVinculada(
  opciones: OpcionesVinculadas,
  entrada: { readonly sql?: string; readonly archivo?: string },
): string {
  if (!/^[a-z0-9]{20}$/.test(opciones.projectRef)) {
    throw new Error('MORPHIQPOS_SUPABASE_PROJECT_REF no tiene el formato esperado.');
  }

  const fuente = entrada.archivo === undefined ? [entrada.sql ?? ''] : ['--file', entrada.archivo];
  const resultado = spawnSync(
    opciones.cliPath ?? 'supabase',
    [
      'db',
      'query',
      '--output-format',
      'json',
      '--linked',
      '--project-ref',
      opciones.projectRef,
      ...fuente,
    ],
    { cwd: RAIZ, encoding: 'utf8', windowsHide: true },
  );

  if (resultado.error !== undefined) throw resultado.error;
  if (resultado.status !== 0) {
    const detalle = resultado.stderr.trim() || resultado.stdout.trim();
    throw new Error(`Supabase CLI no pudo ejecutar la migración vinculada: ${detalle}`);
  }
  return resultado.stdout;
}

function filasLedgerVinculado(salida: string): readonly FilaLedger[] {
  const documento: unknown = JSON.parse(salida);
  if (typeof documento !== 'object' || documento === null || !('rows' in documento)) {
    throw new Error('Supabase CLI devolvió una respuesta sin filas.');
  }

  const rows = documento.rows;
  if (!Array.isArray(rows)) {
    throw new Error('Supabase CLI devolvió rows con un tipo inválido.');
  }
  const filas: readonly unknown[] = rows;

  return filas.map((fila) => {
    if (
      typeof fila !== 'object' ||
      fila === null ||
      !('version' in fila) ||
      typeof fila.version !== 'number' ||
      !('nombre' in fila) ||
      typeof fila.nombre !== 'string' ||
      !('hash' in fila) ||
      typeof fila.hash !== 'string'
    ) {
      throw new Error('El ledger vinculado devolvió una fila inválida.');
    }
    return { version: fila.version, nombre: fila.nombre, hash: fila.hash };
  });
}

/**
 * Ejecuta el mismo protocolo forward-only mediante `supabase db query`.
 * Sirve cuando el acceso vinculado de la CLI está autorizado pero la
 * contraseña de Postgres no está disponible. No cambia el formato del ledger.
 */
export function migrarVinculado(opciones: OpcionesVinculadas): ResultadoMigracion {
  const ensayo = opciones.ensayo ?? false;
  const salida = ejecutarConsultaVinculada(opciones, {
    sql: 'select version, nombre, hash from public._migraciones order by version',
  });
  const registradas = filasLedgerVinculado(salida);
  const enDisco = leerMigraciones();
  comprobarIntegridad(enDisco, registradas);

  const aplicadas = new Set(registradas.map((fila) => fila.version));
  const pendientes = enDisco.filter((migracion) => !aplicadas.has(migracion.version));
  if (pendientes.length === 0) {
    return { aplicadas: [], yaEstaban: registradas.length, ensayo };
  }

  const archivo = join(tmpdir(), `morphiqpos-migraciones-${randomUUID()}.sql`);
  writeFileSync(archivo, prepararTandaVinculada(pendientes, ensayo), 'utf8');
  try {
    ejecutarConsultaVinculada(opciones, { archivo });
  } finally {
    rmSync(archivo, { force: true });
  }

  return {
    aplicadas: pendientes.map((migracion) => migracion.archivo),
    yaEstaban: registradas.length,
    ensayo,
  };
}

/**
 * Lee el ledger. Si la tabla no existe todavía, devuelve vacío.
 *
 * Se distingue «no existe» (`42P01`) de cualquier otro fallo: un
 * «permission denied» tiene que propagarse, no confundirse con una base nueva
 * y disparar una migración desde cero contra un esquema que sí estaba.
 */
async function leerLedger(cliente: pg.PoolClient): Promise<readonly FilaLedger[]> {
  try {
    const resultado = await cliente.query<FilaLedger>(
      'select version, nombre, hash from _migraciones order by version',
    );
    return resultado.rows;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

export async function migrar(opciones: { ensayo?: boolean } = {}): Promise<ResultadoMigracion> {
  const ensayo = opciones.ensayo ?? false;
  const cliente = await obtenerPool().connect();

  try {
    // Se LEE antes de crear. `create table if not exists` parece inofensivo,
    // pero Postgres exige CREATE sobre el schema aunque la tabla ya exista, y
    // eso convertía «no hay nada que aplicar» en «permission denied» para el
    // rol de aplicación, que a propósito no puede hacer DDL.
    //
    // Con este orden, comprobar que la base está al día es una operación de
    // sólo lectura: cualquiera puede verificar, sólo un rol con DDL puede
    // cambiar. Que es exactamente el reparto que se quiere.
    const registradas = await leerLedger(cliente);

    const enDisco = leerMigraciones();
    comprobarIntegridad(enDisco, registradas);

    const yaEstaban = registradas.length;
    const aplicadas = new Set(registradas.map((fila) => fila.version));
    const pendientes = enDisco.filter((m) => !aplicadas.has(m.version));

    if (pendientes.length === 0) {
      return { aplicadas: [], yaEstaban, ensayo };
    }

    // Sólo a partir de aquí hace falta DDL.
    await cliente.query(LEDGER);

    // Una sola transacción para toda la tanda: si la tercera falla, las dos
    // anteriores se revierten. Postgres tiene DDL transaccional.
    await cliente.query('begin');
    try {
      for (const migracion of pendientes) {
        const inicio = process.hrtime.bigint();

        // Sin parámetros → protocolo simple → el archivo entero, con sus
        // decenas de sentencias, viaja en un solo mensaje.
        await cliente.query(migracion.sql);

        const duracion = Number((process.hrtime.bigint() - inicio) / 1_000_000n);

        await cliente.query(
          'insert into _migraciones (version, nombre, hash, duracion_ms) values ($1, $2, $3, $4)',
          [migracion.version, migracion.nombre, migracion.hash, duracion],
        );
      }

      await cliente.query(ensayo ? 'rollback' : 'commit');
    } catch (error) {
      await cliente.query('rollback');
      throw error;
    }

    return { aplicadas: pendientes.map((m) => m.archivo), yaEstaban, ensayo };
  } finally {
    cliente.release();
  }
}
