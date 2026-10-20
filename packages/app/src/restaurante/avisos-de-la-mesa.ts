import 'server-only';

import type { Transaccion } from '@morphiqpos/data';

/**
 * LOS AVISOS DEL GRUPO QUE SE FUE (día completo del restaurante, 2.4).
 *
 * El comensal que pide la cuenta desde su teléfono deja un aviso para el mesero
 * (`solicitudes_qr`, tipo `cuenta`, estado `pendiente`). Nadie lo cerraba al terminar el
 * servicio: la cuenta se cobraba, la mesa se recogía y se volvía a sentar a otro grupo, y el
 * aviso del primero seguía ahí, `pendiente`, apuntando a una cuenta pagada. Lo encontró el día
 * completo con el comensal en su teléfono:
 *
 *   · el SEGUNDO grupo pedía su cuenta y el portal no creaba un aviso nuevo: el índice único
 *     `solicitudes_qr_una_pendiente` (una pendiente por mesa y tipo) hace que `portal.pedir_cuenta`
 *     ACTUALICE la vieja en vez de insertar. La tableta del mesero ya la tenía por vista —avisa
 *     sólo de los avisos nuevos— y el comensal leía «¡Cuenta solicitada!» sin que nadie en la sala
 *     se enterara;
 *   · y si el mesero había llegado a «atenderla» y nadie la resolvió, el grupo siguiente abría su
 *     teléfono y leía «Tu mesero ya vio la solicitud. Pasará a tu mesa en breve» sin haber pedido
 *     nada.
 *
 * Los avisos son del grupo sentado, no de la mesa. Cuando la mesa vuelve al servicio —se limpia,
 * se cancela su cuenta, la cuenta se muda a otra mesa o el grupo de mesas se separa— los avisos
 * que seguían vivos (`pendiente` y `atendida`) quedan `resuelta`. No `cancelada`: el mesero sí
 * fue a la mesa o la cuenta sí se cerró; lo que ya no existe es el grupo que los pidió. Y no se
 * borran: son el historial de lo que el comensal pidió y de cuándo.
 *
 * Va en la MISMA transacción que libera la mesa: o la mesa vuelve al servicio con sus avisos
 * cerrados, o no vuelve.
 */

/** Los dos estados en los que un aviso sigue siendo trabajo vivo para la sala. */
const AVISOS_VIVOS = ['pendiente', 'atendida'] as const;

/** Cierra los avisos vivos de la mesa. Devuelve cuántos cerró. */
export async function cerrarAvisosDeLaMesa(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
  ahora: Date,
): Promise<number> {
  const resultado = await tx
    .updateTable('solicitudes_qr')
    .set({ estado: 'resuelta', resuelta_en: ahora })
    .where('organizacion_id', '=', organizacionId)
    .where('mesa_id', '=', mesaId)
    .where('estado', 'in', [...AVISOS_VIVOS])
    .executeTakeFirst();
  return Number(resultado.numUpdatedRows);
}
