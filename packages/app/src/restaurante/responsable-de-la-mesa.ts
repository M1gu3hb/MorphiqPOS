import 'server-only';

import type { Transaccion } from '@morphiqpos/data';

/**
 * EL MESERO QUE ATIENDE UNA MESA SIN RESPONSABLE SE QUEDA CON ELLA (DP-9.2).
 *
 * Sin asignación de mesas, una mesa que abre el comensal desde el QR nace sin responsable: nadie
 * la tenía. La propina y el corte se reparten por `ordenes.empleado_atiende_id`, y una cuenta sin
 * él cae en «Caja / venta directa». En cuanto un mesero la atiende —toma la mesa o atiende una de
 * sus solicitudes— se queda con la mesa Y con su cuenta abierta.
 *
 * Las dos escrituras llevan `where empleado_atiende_id is null`: nunca le quitan la mesa ni la
 * cuenta a quien ya las tenía, y dos meseros a la vez no se las roban (el segundo cambia cero
 * filas). Con la asignación encendida la cuenta nace a nombre del mesero asignado, así que aquí
 * no cambia nada.
 */
export async function quedarseConLaMesa(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
  empleoId: string,
): Promise<{ readonly mesa: boolean; readonly cuenta: boolean }> {
  const mesa = await tx
    .updateTable('mesas')
    .set({ empleado_atiende_id: empleoId })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .where('empleado_atiende_id', 'is', null)
    .executeTakeFirst();

  const cuenta = await tx
    .updateTable('ordenes')
    .set({ empleado_atiende_id: empleoId })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', (eb) =>
      eb
        .selectFrom('mesas')
        .select('orden_activa_id')
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', mesaId),
    )
    .where('empleado_atiende_id', 'is', null)
    .executeTakeFirst();

  return {
    mesa: Number(mesa.numUpdatedRows) === 1,
    cuenta: Number(cuenta.numUpdatedRows) === 1,
  };
}
