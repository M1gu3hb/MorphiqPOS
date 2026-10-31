import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

/**
 * LA UNIÓN ES DEL SALÓN (DP-9.6): vive entre un cliente y el siguiente.
 *
 * Una cuenta que se abre en la principal de una unión viva es la cuenta del grupo: la unión la
 * toma (`uniones_mesa.orden_id`) y la cuenta lo sabe (`ordenes.union_id`). Y una mesa absorbida
 * no se abre: está oculta en el mapa y su gente pide en la principal.
 */

/** La cuenta recién abierta en una mesa principal pasa a ser la del grupo. */
export async function tomarLaUnionDeLaMesa(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly mesaId: string;
    readonly ordenId: string;
    readonly ahora: Date;
  },
): Promise<string | null> {
  const union = await tx
    .updateTable('uniones_mesa')
    .set({ orden_id: datos.ordenId })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('mesa_principal_id', '=', datos.mesaId)
    .where('cerrada_en', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (union === undefined) return null;
  await tx
    .updateTable('ordenes')
    .set({ union_id: union.id, updated_at: datos.ahora })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .execute();
  return union.id;
}

/** Una mesa absorbida en una unión viva no se abre ni se libera sola: se hace en la principal. */
export async function exigirQueNoEsteAbsorbida(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
  que: 'abre' | 'libera' | 'usa' = 'abre',
): Promise<void> {
  const fila = await tx
    .selectFrom('mesas')
    .select(['numero', 'unida_a_mesa_id'])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .executeTakeFirst();
  const principalId = fila?.unida_a_mesa_id ?? null;
  if (fila === undefined || principalId === null) return;
  const principal = await tx
    .selectFrom('mesas')
    .select('numero')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', principalId)
    .executeTakeFirst();
  const suya = principal === undefined ? 'principal' : String(principal.numero);
  throw new ErrorDominio(
    'MESA_YA_ABIERTA',
    `La mesa ${String(fila.numero)} está unida a la ${suya}: ${que} la ${suya}.`,
  );
}

/**
 * ¿La mesa ENCABEZA esa unión? Una miembro también «está en» la unión (`unionAbiertaDeMesa`),
 * pero no decide por el grupo: se libera desde la principal.
 */
export async function encabezaLaUnion(
  tx: Transaccion,
  organizacionId: string,
  unionId: string,
  mesaId: string,
): Promise<boolean> {
  const fila = await tx
    .selectFrom('uniones_mesa')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', unionId)
    .where('mesa_principal_id', '=', mesaId)
    .executeTakeFirst();
  return fila !== undefined;
}

/**
 * EL ORDEN DE LOS CANDADOS de un grupo (DP-9.6): primero las CUENTAS de sus mesas, luego las
 * MESAS —la principal antes que las demás, y éstas por id—. Es el orden del cobro (cuenta →
 * mesa) y el de liberar y separar (principal → miembros): dos meseros, o el mesero y la caja,
 * sobre las mismas mesas se esperan en vez de trabarse. Lo que se lee después ya no cambia
 * por debajo: la mesa del medio no queda en dos uniones ni una cuenta se cobra mientras se une.
 */
export async function bloquearElGrupo(
  tx: Transaccion,
  organizacionId: string,
  principalId: string,
  otrasIds: readonly string[],
): Promise<void> {
  const resto = [...new Set(otrasIds)].filter((id) => id !== principalId).sort();
  const conCuenta = await tx
    .selectFrom('mesas')
    .select('orden_activa_id')
    .where('organizacion_id', '=', organizacionId)
    .where('id', 'in', [principalId, ...resto])
    .execute();
  const cuentas = [
    ...new Set(conCuenta.map((m) => m.orden_activa_id).filter((id): id is string => id !== null)),
  ].sort();
  if (cuentas.length > 0) {
    await tx
      .selectFrom('ordenes')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('id', 'in', cuentas)
      .orderBy('id')
      .forUpdate()
      .execute();
  }
  await tx
    .selectFrom('mesas')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', principalId)
    .forUpdate()
    .execute();
  if (resto.length > 0) {
    await tx
      .selectFrom('mesas')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('id', 'in', resto)
      .orderBy('id')
      .forUpdate()
      .execute();
  }
}
