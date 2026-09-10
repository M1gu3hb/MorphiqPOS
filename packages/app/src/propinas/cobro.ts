import 'server-only';

import type { Transaccion } from '@morphiqpos/data';

/**
 * Lo que el cobro escribe de propina (F1-04 §38.2, hueco confirmado).
 *
 * Antes de esto, `grep -rn "propina" packages/app/src packages/contracts/src
 * packages/data/src` devolvía **una sola línea**, y era la declaración de la
 * columna en `esquema.ts`. Es decir: `pagos.propina_centavos` existía en la base
 * y nadie la escribía nunca, así que las reglas 1 a 4 de `F1-01` §3 no se podían
 * cumplir por bien que estuviera el mapa.
 *
 * ── Por qué el `insert` vive aquí y no en `repoOrdenes.registrarPago` ──────
 * `NuevoPago` (`packages/data/src/repos/ordenes/cierre.ts:13-23`) no tiene campo
 * de propina, y ese archivo es de otro módulo. El sitio correcto para esto es
 * añadirle `propinaCentavos` a `NuevoPago`; queda anotado en el informe. Mientras
 * tanto se inserta desde aquí, con las mismas columnas y el mismo `estado`.
 */

export interface PagoConPropina {
  readonly organizacionId: string;
  readonly ordenId: string;
  readonly sesionCajaId: string | null;
  readonly metodo: string;
  /** La VENTA cobrada por este método. Nunca lleva propina dentro (regla 1). */
  readonly montoCentavos: bigint;
  /** Exacta para ESTE método. Nunca un reparto proporcional (regla 3). */
  readonly propinaCentavos: bigint;
  readonly recibidoCentavos: bigint | null;
  readonly cambioCentavos: bigint;
  readonly referencia: string | null;
  readonly idempotencyKey: string | null;
}

/** Un pago mixto son varias llamadas, una por método, cada una con su propina. */
export async function registrarPagoConPropina(
  tx: Transaccion,
  pago: PagoConPropina,
): Promise<void> {
  await tx
    .insertInto('pagos')
    .values({
      organizacion_id: pago.organizacionId,
      orden_id: pago.ordenId,
      sesion_caja_id: pago.sesionCajaId,
      metodo: pago.metodo,
      monto_centavos: pago.montoCentavos,
      propina_centavos: pago.propinaCentavos,
      recibido_centavos: pago.recibidoCentavos,
      cambio_centavos: pago.cambioCentavos,
      referencia: pago.referencia,
      idempotency_key: pago.idempotencyKey,
      estado: 'confirmado',
    })
    .execute();
}

export interface MetadatosDePropina {
  readonly organizacionId: string;
  readonly ordenId: string;
  /** 15 % es 1500. `check propina_puntos_base between 0 and 10000`. */
  readonly puntosBase: number | undefined;
  readonly tipo: string | undefined;
  readonly origen: string | undefined;
}

/**
 * Cómo se decidió la propina: porcentaje, monto a mano, pendiente… y desde dónde.
 *
 * Es lo único de propina que va en `ordenes`, y a propósito **no incluye ningún
 * importe**: el dinero vive en `pagos`, en otra tabla, para que no exista la forma
 * de inflar `total_centavos` con una propina (F1-04 §6.1).
 *
 * No escribe nada si la pantalla no mandó nada. Un `update` que pone tres nulos
 * encima de tres nulos sólo sirve para mover `updated_at`, y `Configuracion.jsx`
 * rehidrata formularios con esa columna.
 */
export async function marcarPropinaDeOrden(
  tx: Transaccion,
  datos: MetadatosDePropina,
): Promise<void> {
  if (datos.puntosBase === undefined && datos.tipo === undefined && datos.origen === undefined) {
    return;
  }

  await tx
    .updateTable('ordenes')
    .set({
      propina_puntos_base: datos.puntosBase ?? 0,
      propina_tipo: datos.tipo ?? null,
      propina_origen: datos.origen ?? null,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .execute();
}
