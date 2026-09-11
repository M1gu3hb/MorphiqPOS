import 'server-only';

import type { Kysely, Transaction } from 'kysely';
import type { Esquema, Transaccion } from '@morphiqpos/data';

/**
 * El ÚNICO sitio del puente donde se afloja el tipado de Kysely.
 *
 * Kysely tipa cada consulta contra `Esquema`, y eso es exactamente lo que se
 * quiere en el resto del sistema: una columna mal escrita no compila. Pero el
 * puente elige la tabla y las columnas EN TIEMPO DE EJECUCIÓN, a partir del
 * mapa. Ningún tipo estático puede saber cuál va a ser.
 *
 * Así que la conversión se hace una vez, aquí, con nombre y con explicación —en
 * vez de esparcir una docena de `as any` por tres archivos, que es como se
 * pierde la pista de qué está sin comprobar—.
 *
 * **Lo que sigue garantizando que esto es seguro no es el tipo: es la lista
 * blanca.** `mapa.ts` es la única fuente de nombres de tabla y de columna, y
 * nada que venga del cliente llega a una consulta sin pasar por ella. Un nombre
 * que no esté en el mapa se rechaza antes de tocar la base.
 */

/** Un esquema abierto: cualquier tabla, cualquier columna. */
export type EsquemaLibre = Readonly<Record<string, Record<string, never>>>;

export function baseLibre(db: Kysely<Esquema>): Kysely<EsquemaLibre> {
  return db as unknown as Kysely<EsquemaLibre>;
}

export function transaccionLibre(tx: Transaccion): Transaction<EsquemaLibre> {
  return tx as unknown as Transaction<EsquemaLibre>;
}
