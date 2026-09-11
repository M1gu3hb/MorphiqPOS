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
 *
 * ── Se escribe SÓLO lo que vino, campo por campo ───────────────────────────
 * Antes bastaba con que llegara UNO de los tres para escribir los tres, con
 * `?? 0` y `?? null` rellenando los que faltaban. Y estas columnas tienen otro
 * escritor: `portal.pedir_cuenta` (`portal/cuenta.ts:68-78`) las pone cuando el
 * comensal elige la propina en el QR. El caso real: el comensal toca «15 %» y la
 * orden queda con `puntos_base=1500, tipo='porcentaje', origen='portal_qr'`;
 * después el cajero cobra y su pantalla manda sólo `propinaOrigen: 'caja'`
 * porque la propina se dejó en efectivo en el mostrador. El `update` de tres
 * columnas dejaba `puntos_base=0` y `tipo=NULL`, destruía el «cómo se decidió la
 * propina» que este archivo existe para preservar, y `portal/cuenta-publica.ts`
 * empezaba a servir `propina_porcentaje: 0`.
 *
 * `updated_at` no se escribe a mano a propósito: `ordenes` tiene el trigger
 * `ordenes_tocar_updated_at` (`003_venta_caja_inventario.sql:444-452`), así que
 * la fila sí deja rastro. `version` tampoco se toca: incrementarla sin haber
 * leído la actual no es bloqueo optimista, es pisar el contador de quien sí lo
 * usa, y el cobro que llama aquí ya cierra la orden por su cuenta.
 */
export async function marcarPropinaDeOrden(
  tx: Transaccion,
  datos: MetadatosDePropina,
): Promise<void> {
  const cambios = {
    ...(datos.puntosBase === undefined ? {} : { propina_puntos_base: datos.puntosBase }),
    ...(datos.tipo === undefined ? {} : { propina_tipo: datos.tipo }),
    ...(datos.origen === undefined ? {} : { propina_origen: datos.origen }),
  };

  if (Object.keys(cambios).length === 0) return;

  await tx
    .updateTable('ordenes')
    .set(cambios)
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .execute();
}
