import 'server-only';

import { sql, type Kysely, type Transaction } from 'kysely';

import { obtenerDb } from '../cliente.ts';
import type { Esquema } from '../esquema.ts';

type Conexion = Kysely<Esquema> | Transaction<Esquema>;

export interface ReservaCuotaArchivo {
  readonly organizacionId: string;
  readonly bytesNuevos: number;
  readonly limiteBytes: number;
  readonly bytesObservados: number;
}

/**
 * Construye una sola sentencia que inicializa, suma y aplica el límite.
 * El WHERE del conflicto se evalúa bajo el bloqueo de la fila de Postgres.
 */
export function construirReservaCuotaArchivo(db: Conexion, reserva: ReservaCuotaArchivo) {
  const bytesNuevos = BigInt(reserva.bytesNuevos);
  const limiteBytes = BigInt(reserva.limiteBytes);
  const bytesObservados = BigInt(reserva.bytesObservados);
  const totalInicial = bytesObservados + bytesNuevos;

  return db
    .insertInto('cuotas_archivos')
    .columns(['organizacion_id', 'bytes_usados', 'updated_at'])
    .expression(
      db
        .selectNoFrom([
          sql<string>`${reserva.organizacionId}`.as('organizacion_id'),
          sql<bigint>`${totalInicial}`.as('bytes_usados'),
          sql<Date>`now()`.as('updated_at'),
        ])
        .where(sql<boolean>`${totalInicial} <= ${limiteBytes}`),
    )
    .onConflict((conflicto) =>
      conflicto
        .column('organizacion_id')
        .doUpdateSet({
          bytes_usados: sql<bigint>`greatest(cuotas_archivos.bytes_usados, ${bytesObservados}) + ${bytesNuevos}`,
          updated_at: sql<Date>`now()`,
        })
        .where(
          sql<boolean>`greatest(cuotas_archivos.bytes_usados, ${bytesObservados}) + ${bytesNuevos} <= ${limiteBytes}`,
        ),
    )
    .returning('bytes_usados');
}

export async function reservarCuotaArchivo(reserva: ReservaCuotaArchivo): Promise<bigint | null> {
  const fila = await construirReservaCuotaArchivo(obtenerDb(), reserva).executeTakeFirst();
  return fila?.bytes_usados ?? null;
}

/** Compensa una reserva cuando el objeto no llegó a guardarse. */
export async function liberarCuotaArchivo(
  organizacionId: string,
  bytesReservados: number,
): Promise<void> {
  await obtenerDb()
    .updateTable('cuotas_archivos')
    .set({
      bytes_usados: sql<bigint>`greatest(0, bytes_usados - ${BigInt(bytesReservados)})`,
      updated_at: sql<Date>`now()`,
    })
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();
}

function contieneUrl(valor: unknown, url: string): boolean {
  if (typeof valor === 'string') return valor === url;
  if (Array.isArray(valor)) return valor.some((elemento) => contieneUrl(elemento, url));
  if (typeof valor !== 'object' || valor === null) return false;
  return Object.values(valor).some((elemento) => contieneUrl(elemento, url));
}

export async function referenciaPublicaExiste(
  organizacionId: string,
  url: string,
): Promise<boolean> {
  const db = obtenerDb();
  const [producto, seccion, configuracion] = await Promise.all([
    db
      .selectFrom('productos')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('imagen_url', '=', url)
      .executeTakeFirst(),
    db
      .selectFrom('menu_qr_secciones')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('imagen_url', '=', url)
      .executeTakeFirst(),
    db
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', organizacionId)
      .executeTakeFirst(),
  ]);
  return (
    producto !== undefined || seccion !== undefined || contieneUrl(configuracion?.valores, url)
  );
}
