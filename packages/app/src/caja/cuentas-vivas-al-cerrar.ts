import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoOrdenes } from '@morphiqpos/data';
import { sql } from 'kysely';

/**
 * C10 · LA ÚLTIMA CAJA NO CIERRA CON CUENTAS VIVAS (DP-10.2).
 *
 * Una cuenta de mesa no tiene `sesion_caja_id` hasta que se cobra, así que para el cierre era
 * invisible: el corte salía cuadrado sin una venta que ya se comió y la mesa se quedaba sentada
 * sin caja que la cobrara. Ahora, dentro de la transacción del cierre:
 *   · si es la ÚLTIMA caja abierta de la sucursal y quedan cuentas vivas, se rechaza y se dice
 *     qué mesas faltan;
 *   · si hay otra caja abierta, cierra y se avisa: las cobrará la otra.
 *
 * «Cuenta viva» es una orden cobrable de la sucursal que cuelga de una mesa o es una parte de
 * una cuenta dividida (sus partes no tienen mesa: su madre sí). Un carrito de mostrador sin mesa
 * no cuenta: no es del salón, y lo cubren sus propias reglas (apartadas, pedidos sin entregar).
 */

export interface CuentasVivas {
  readonly cuentas: number;
  /** Los números de mesa, sin repetir y en orden. */
  readonly mesas: readonly number[];
}

export interface AvisoDelCierre {
  readonly mensaje: string;
  readonly cuentasVivas: number;
  readonly mesas: readonly number[];
  readonly otrasCajasAbiertas: number;
}

/**
 * Las cajas abiertas de la sucursal de esa terminal, BLOQUEADAS y en orden de id. Va antes que
 * cualquier otro bloqueo del cierre: dos cajas que cierran a la vez se forman una detrás de la
 * otra, y la segunda ya ve cerrada a la primera (`estado` se vuelve a evaluar al soltarse el
 * candado). Sin esto las dos leerían «queda la otra» y cerrarían las dos.
 */
export async function bloquearLasCajasDeLaSucursal(
  tx: Transaccion,
  organizacionId: string,
  terminalId: string,
): Promise<readonly string[]> {
  const filas = await tx
    .selectFrom('sesiones_caja')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('estado', '=', 'abierta')
    .where('sucursal_id', '=', (eb) =>
      eb
        .selectFrom('terminales')
        .select('sucursal_id')
        .where('id', '=', terminalId)
        .where('organizacion_id', '=', organizacionId),
    )
    .orderBy('id')
    .forUpdate()
    .execute();
  return filas.map((f) => f.id);
}

export async function cuentasVivasDeLaSucursal(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
): Promise<CuentasVivas> {
  const vivas = await tx
    .selectFrom('ordenes as o')
    .leftJoin('ordenes as madre', 'madre.id', 'o.orden_padre_id')
    .select(['o.id', sql<string | null>`coalesce(o.mesa_id, madre.mesa_id)`.as('mesaId')])
    .where('o.organizacion_id', '=', organizacionId)
    .where('o.sucursal_id', '=', sucursalId)
    .where('o.estado', 'in', [...repoOrdenes.ESTADOS_COBRABLES])
    .where((eb) => eb.or([eb('o.mesa_id', 'is not', null), eb('o.orden_padre_id', 'is not', null)]))
    .execute();
  const mesaIds = [
    ...new Set(vivas.map((v) => v.mesaId).filter((id): id is string => id !== null)),
  ];
  const mesas =
    mesaIds.length === 0
      ? []
      : await tx
          .selectFrom('mesas')
          .select('numero')
          .where('organizacion_id', '=', organizacionId)
          .where('id', 'in', mesaIds)
          .execute();
  return {
    cuentas: vivas.length,
    mesas: [...new Set(mesas.map((m) => m.numero))].sort((a, b) => a - b),
  };
}

/** «la mesa 3», «las mesas 1 y 2», «las mesas 1, 2 y 5». */
export function lasMesas(mesas: readonly number[]): string {
  if (mesas.length === 0) return 'cuentas sin mesa';
  const numeros = mesas.map(String);
  if (numeros.length === 1) return `la mesa ${numeros[0] ?? ''}`;
  return `las mesas ${numeros.slice(0, -1).join(', ')} y ${numeros.at(-1) ?? ''}`;
}

/**
 * La decisión: `null` si no queda nada vivo; un aviso si queda y hay otra caja abierta. Si
 * queda y ésta es la última, LANZA: ese corte no se firma.
 */
export function decidirElCierre(
  vivas: CuentasVivas,
  otrasCajasAbiertas: number,
): AvisoDelCierre | null {
  if (vivas.cuentas === 0) return null;
  if (otrasCajasAbiertas === 0) {
    throw new ErrorDominio(
      'TRANSICION_INVALIDA',
      `Quedan cuentas sin cobrar en ${lasMesas(vivas.mesas)}: cóbralas antes de cerrar la ` +
        'última caja abierta.',
      { cuentasVivas: vivas.cuentas, mesas: vivas.mesas.join(', ') },
    );
  }
  return {
    cuentasVivas: vivas.cuentas,
    mesas: vivas.mesas,
    otrasCajasAbiertas,
    mensaje: `Quedan cuentas sin cobrar en ${lasMesas(vivas.mesas)}: las cobrará la otra caja abierta.`,
  };
}
