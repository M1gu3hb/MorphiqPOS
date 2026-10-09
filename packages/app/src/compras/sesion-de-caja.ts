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
 * La caja de la que sale el gasto.
 *
 * Era «la caja abierta de la sucursal», una sola, porque lo imponía
 * `sesiones_caja_una_abierta_por_sucursal` (046). Desde la 179 una sucursal puede tener
 * varias (F-235: la cafetería abre dos el fin de semana), y el efectivo sale de UN cajón:
 * el de la terminal desde la que se registra. Si se registra desde una terminal sin caja
 * —la oficina— y la sucursal tiene una sola abierta, es ésa; si tiene varias, no se
 * adivina: se pide registrarlo desde la caja de la que salió.
 *
 * Si no hay ninguna, el gasto en efectivo no se registra: sin sesión, el dinero sale del
 * cajón sin quedar en ningún arqueo y el corte del día nace con un faltante que nadie
 * sabe explicar.
 *
 * El día se calcula en la zona horaria de la organización, igual que el resto
 * del sistema (`catalogo/inicio.ts`): un turno que cruza la medianoche del
 * servidor sigue perteneciendo al día en que se abrió la caja.
 */
export async function sesionAbierta(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  terminalId: string | null = null,
): Promise<SesionDeCaja> {
  const filas = await tx
    .selectFrom('sesiones_caja as s')
    .innerJoin('organizaciones as o', 'o.id', 's.organizacion_id')
    .select(['s.id', 's.terminal_id'])
    .select(
      sql<string>`to_char((s.abierta_en at time zone o.zona_horaria)::date, 'YYYY-MM-DD')`.as(
        'fecha',
      ),
    )
    .where('s.organizacion_id', '=', organizacionId)
    .where('s.sucursal_id', '=', sucursalId)
    .where('s.estado', '=', 'abierta')
    .execute();

  const fila = laCajaDeLaQueSale(filas, terminalId, LO_QUE_SALE.gasto);
  return { id: fila.id, fecha: fila.fecha };
}

/** Cómo se dice, en el mensaje, lo que sale del cajón. */
const LO_QUE_SALE = {
  gasto: { pagar: 'este gasto', registrar: 'el gasto' },
  compra: { pagar: 'esta compra', registrar: 'la compra' },
} as const;

/**
 * LA REGLA DE LA CAJA DE LA QUE SALE EL DINERO, una sola vez para el gasto y para la
 * compra de contado (bloque D de la 2.4): la de esta terminal; si esta terminal no tiene,
 * la única abierta de la sucursal; ninguna, o varias sin la de aquí, no se adivina.
 */
function laCajaDeLaQueSale<F extends { readonly terminal_id: string | null }>(
  filas: readonly F[],
  terminalId: string | null,
  que: (typeof LO_QUE_SALE)[keyof typeof LO_QUE_SALE],
): F {
  if (filas.length === 0) {
    throw new ErrorDominio(
      'CAJA_CERRADA',
      `No hay una caja abierta. Ábrela antes de pagar ${que.pagar} en efectivo, ` +
        'o regístralo con tarjeta o transferencia si no salió del cajón.',
    );
  }
  const deEstaTerminal = filas.find((f) => terminalId !== null && f.terminal_id === terminalId);
  const fila = deEstaTerminal ?? (filas.length === 1 ? filas[0] : undefined);
  if (fila === undefined) {
    throw new ErrorDominio(
      'CAJA_CERRADA',
      `Hay varias cajas abiertas: registra ${que.registrar} desde la terminal de la caja de la que salió el dinero.`,
    );
  }
  return fila;
}

/**
 * La caja de la que sale una COMPRA DE CONTADO (bloque D de la 2.4), con la misma regla
 * que un gasto en efectivo. Sin la fecha del gasto: la compra se fecha por la entrada del
 * material, y lo que se cuenta en el arqueo de hoy es el movimiento, que cuelga de esta
 * caja.
 */
export async function cajaDeLaCompra(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  terminalId: string | null,
): Promise<{ readonly id: string }> {
  const filas = await tx
    .selectFrom('sesiones_caja')
    .select(['id', 'terminal_id'])
    .where('organizacion_id', '=', organizacionId)
    .where('sucursal_id', '=', sucursalId)
    .where('estado', '=', 'abierta')
    .execute();
  const fila = laCajaDeLaQueSale(filas, terminalId, LO_QUE_SALE.compra);
  return { id: fila.id };
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
