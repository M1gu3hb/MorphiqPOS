import 'server-only';

import { obtenerPool } from '../cliente.ts';
import { leerMigraciones, type Migracion } from './lectura.ts';

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
export async function migrar(opciones: { ensayo?: boolean } = {}): Promise<ResultadoMigracion> {
  const ensayo = opciones.ensayo ?? false;
  const cliente = await obtenerPool().connect();

  try {
    await cliente.query(LEDGER);

    const registradas = await cliente.query<{ version: number; nombre: string; hash: string }>(
      'select version, nombre, hash from _migraciones order by version',
    );

    const enDisco = leerMigraciones();
    comprobarIntegridad(enDisco, registradas.rows);

    const yaEstaban = registradas.rows.length;
    const aplicadas = new Set(registradas.rows.map((fila) => fila.version));
    const pendientes = enDisco.filter((m) => !aplicadas.has(m.version));

    if (pendientes.length === 0) {
      return { aplicadas: [], yaEstaban, ensayo };
    }

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
