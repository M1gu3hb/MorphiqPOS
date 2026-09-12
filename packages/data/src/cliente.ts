import 'server-only';

import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';

import type { Esquema } from './esquema.ts';
import { registrar } from './observabilidad.ts';
import { tlsPara } from './tls.ts';

/**
 * El único punto del sistema que abre una conexión a Postgres (F1.1-T01).
 *
 * ADR 0001: Kysely sobre `pg`, con el esquema entero en archivos `.sql` y los
 * tipos generados de la base. Kysely no posee el esquema: sólo le da tipos a
 * las consultas.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Parsers de tipo — se configuran ANTES de abrir el pool
//
// `pg` devuelve int8 (bigint) como CADENA por omisión, para no perder precisión
// al pasar por `number`. Como todo el dinero del sistema es `bigint` de centavos
// (R15), aquí se convierte a `bigint` nativo de JavaScript.
//
// Sin esto, un total de 405.50 llegaría como la cadena "40550" y cualquier
// aritmética con él sería concatenación de texto o una conversión a `number`
// que reintroduce el punto flotante — exactamente lo que `packages/domain/dinero`
// existe para impedir.
// ─────────────────────────────────────────────────────────────────────────────
const OID_INT8 = 20;
const OID_NUMERIC = 1700;
const OID_DATE = 1082;

pg.types.setTypeParser(OID_INT8, (valor: string) => BigInt(valor));

// `date` es un día del calendario, no un instante. `pg` lo convierte por omisión
// a un `Date` a medianoche EN LA ZONA DEL SERVIDOR: un empleo que empieza el
// 1 de marzo se lee como el 28 de febrero a las 18:00 en cuanto el proceso corre
// en UTC y el negocio está en Ciudad de México. Se conserva la cadena
// `YYYY-MM-DD`, que es lo que la columna realmente significa.
pg.types.setTypeParser(OID_DATE, (valor: string) => valor);

// `numeric` se usa para cantidades de inventario, que llevan hasta cuatro
// decimales (`numeric(14,4)`). Convertirlo a `number` perdería precisión en
// fracciones de gramo, así que se conserva como cadena y lo interpreta el
// módulo de cantidades.
pg.types.setTypeParser(OID_NUMERIC, (valor: string) => valor);

// ─────────────────────────────────────────────────────────────────────────────

let pool: pg.Pool | undefined;
let db: Kysely<Esquema> | undefined;

/**
 * Configuración del pool.
 *
 * Gate PRS §12A: "pool de conexiones dimensionado, no un cliente por request".
 * El límite real no lo pone la aplicación sino el proveedor: Supabase con
 * pooler en modo transacción admite bastante, pero cada función serverless de
 * Vercel abre su propio pool. `max: 10` por instancia es el punto donde ya no
 * se hace cola en una terminal de caja y todavía no se agota el proveedor.
 */
function configuracion(cadena: string): pg.PoolConfig {
  const ssl = tlsPara(cadena);

  return {
    connectionString: cadena,
    max: 10,
    idleTimeoutMillis: 30_000,
    // Un cajero no puede quedarse esperando media hora a que la base responda.
    // Falla rápido y la pantalla lo dice (R12).
    connectionTimeoutMillis: 10_000,
    // Supabase exige TLS y firma con su propia raíz; `tlsPara` la fija. El
    // Postgres del compose no tiene TLS, y forzarlo ahí rompería la prueba de
    // portabilidad que protege A-27.
    ...(ssl === false ? {} : { ssl }),
    application_name: 'morphiqpos',
  };
}

/**
 * Devuelve la instancia de Kysely, creándola la primera vez.
 *
 * Es perezosa a propósito: importar este módulo no abre conexiones. Una prueba
 * unitaria que toque un archivo que lo importe de rebote no debe acabar
 * hablando con Postgres.
 */
export function obtenerDb(): Kysely<Esquema> {
  if (db !== undefined) return db;

  const cadena = process.env['DATABASE_URL'];
  if (cadena === undefined || cadena.length === 0) {
    throw new Error(
      'DATABASE_URL no está definida. packages/contracts/entorno la valida al arrancar; ' +
        'si llegaste hasta aquí sin ella, algo se saltó esa validación.',
    );
  }

  pool = new pg.Pool(configuracion(cadena));

  // Un error del pool sin manejador tumba el proceso de Node entero (R12: el
  // error se maneja o se propaga, pero nunca se ignora en silencio).
  pool.on('error', () => {
    registrar({
      nivel: 'error',
      modulo: 'postgres_pool',
      correlationId: 'sin_correlacion',
      organizacionId: null,
      mensaje: 'El pool de Postgres informó un error.',
    });
  });

  db = new Kysely<Esquema>({ dialect: new PostgresDialect({ pool }) });
  return db;
}

/**
 * El pool crudo de `pg`.
 *
 * Sólo lo usa el ejecutor de migraciones, y por una razón concreta: Kysely envía
 * las consultas por el **protocolo extendido**, que admite una sola sentencia
 * por mensaje. Un archivo de migración tiene decenas. Con un cliente de `pg` sin
 * parámetros se usa el protocolo simple, que sí acepta el archivo completo.
 *
 * Ningún repositorio lo toca: para leer y escribir se usa Kysely, que da tipos.
 */
export function obtenerPool(): pg.Pool {
  obtenerDb();
  if (pool === undefined) {
    throw new Error('El pool no se inicializó.');
  }
  return pool;
}

/** Cierra el pool. Sólo lo usan las pruebas y el apagado del worker. */
export async function cerrarDb(): Promise<void> {
  await db?.destroy();
  db = undefined;
  pool = undefined;
}

/**
 * Una transacción de Kysely. Es lo que recibe el cuerpo de un comando.
 *
 * Se tipa igual que `Kysely<Esquema>`, así que un repositorio puede aceptar
 * indistintamente la base o la transacción: es lo que permite componer un
 * comando atómico a partir de repositorios sueltos (04-ARQUITECTURA §3).
 */
export type Transaccion = Transaction<Esquema>;

/**
 * Ejecuta `fn` dentro de una transacción real.
 *
 * O confirma todo, o no persiste nada (R10). Si `fn` lanza —incluido un fallo
 * inyectado a mitad—, Postgres revierte y el error sube. **No se atrapa aquí**:
 * atraparlo sería exactamente el `catch` vacío que dejó el cobro a medias en
 * las dos fuentes (P0-03).
 *
 * `SERIALIZABLE` no se usa por omisión: cuesta reintentos y el aislamiento que
 * el cobro necesita lo dan las restricciones únicas y el decremento atómico,
 * que funcionan en `READ COMMITTED`. Un comando que de verdad necesite
 * serializable lo pide explícitamente.
 */
export async function conTransaccion<T>(fn: (tx: Transaccion) => Promise<T>): Promise<T> {
  return obtenerDb().transaction().execute(fn);
}

/**
 * Comprueba que la base responde y devuelve su versión.
 *
 * Ejecuta SQL de verdad. Es la diferencia con lo que F1.0 llamaba "prueba de
 * integración": abrir un socket TCP no prueba que haya una base al otro lado.
 */
export async function comprobarConexion(): Promise<{ version: string; base: string }> {
  const fila = await sql<{
    version: string;
    base: string;
  }>`select version() as version, current_database() as base`.execute(obtenerDb());

  const primera = fila.rows[0];
  if (primera === undefined) {
    throw new Error('La consulta de comprobación no devolvió ninguna fila.');
  }
  return primera;
}
