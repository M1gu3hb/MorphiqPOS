import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

/**
 * La caja de la que sale un gasto en efectivo, y el día al que pertenece.
 *
 * Vive aparte de `gastos.ts` porque la decisión que aquí se toma —qué fecha
 * lleva un gasto que mueve el cajón— es pura y tiene su propia prueba, mientras
 * que leer la sesión necesita Postgres.
 */

export interface SesionDeCaja {
  readonly id: string;
  /** El día del arqueo al que pertenece la sesión, `YYYY-MM-DD`. */
  readonly fecha: string;
}

/**
 * La caja abierta de la sucursal.
 *
 * Es una sola: lo impone `sesiones_caja_una_abierta_por_sucursal` (046:85), y
 * por eso no hace falta la terminal. Si no hay ninguna, el gasto en efectivo no
 * se registra: sin sesión, el dinero sale del cajón sin quedar en ningún arqueo
 * y el corte del día nace con un faltante que nadie sabe explicar.
 *
 * El día se calcula en la zona horaria de la organización, igual que el resto
 * del sistema (`catalogo/inicio.ts`): un turno que cruza la medianoche del
 * servidor sigue perteneciendo al día en que se abrió la caja.
 */
export async function sesionAbierta(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
): Promise<SesionDeCaja> {
  const fila = await tx
    .selectFrom('sesiones_caja as s')
    .innerJoin('organizaciones as o', 'o.id', 's.organizacion_id')
    .select('s.id')
    .select(
      sql<string>`to_char((s.abierta_en at time zone o.zona_horaria)::date, 'YYYY-MM-DD')`.as(
        'fecha',
      ),
    )
    .where('s.organizacion_id', '=', organizacionId)
    .where('s.sucursal_id', '=', sucursalId)
    .where('s.estado', '=', 'abierta')
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio(
      'CAJA_CERRADA',
      'No hay una caja abierta. Ábrela antes de pagar este gasto en efectivo, ' +
        'o regístralo con tarjeta o transferencia si no salió del cajón.',
    );
  }
  return { id: fila.id, fecha: fila.fecha };
}

/**
 * Qué fecha lleva un gasto pagado en efectivo: la de SU sesión de caja.
 *
 * §25.2 dice que `total_gastos` y `efectivo_esperado` salen de la misma fuente
 * y no pueden discrepar. La fecha volvía a abrir esa discrepancia por otro
 * lado: `sesion_caja_id` es siempre la sesión abierta ahora, pero `fecha`
 * viajaba del cliente y nadie comprobaba que cayeran el mismo día. Un gasto en
 * efectivo de $500 fechado «el lunes pasado» dejaba un `movimientos_caja` de
 * −$500 colgado de la sesión de HOY —el efectivo esperado de hoy baja sin que
 * ningún reporte de gastos de hoy lo explique— y el arqueo del lunes, ya
 * cerrado, no lo veía nunca.
 *
 * Se rechaza en vez de corregirse en silencio: quien captura tiene que saber
 * que ese gasto entra en el corte de hoy, no en el del lunes.
 */
export function fechaDelGastoEnEfectivo(
  fechaCapturada: string | undefined,
  sesion: SesionDeCaja,
): string {
  if (fechaCapturada === undefined || fechaCapturada === sesion.fecha) return sesion.fecha;

  throw new ErrorDominio(
    'GASTO_INVALIDO',
    `Un gasto en efectivo sale del cajón de la caja abierta, que es la del ${sesion.fecha}, ` +
      `así que no se puede fechar el ${fechaCapturada}: el arqueo de ese día ya no lo vería ` +
      'y el de hoy no sabría explicarlo. Regístralo con la fecha de hoy, o con tarjeta o ' +
      'transferencia si no salió del cajón.',
  );
}
