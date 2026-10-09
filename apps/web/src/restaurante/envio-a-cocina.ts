/**
 * LO QUE LA MESA ACTIVA MANDA A COCINA, sin pantalla (día completo del restaurante, 2.4).
 *
 * ── El defecto que esto arregla ──────────────────────────────────────────────
 * `MesaActiva` mandaba `cantidad` como NÚMERO —`{ productoId, cantidad: 2 }`— y
 * `restaurante.enviar_pedido` la valida como CADENA decimal (`numeric(14,4)` en la base,
 * nunca un flotante: R15). Cada envío volvía `ENTRADA_INVALIDA`, la pantalla enseñaba
 * «La comanda NO llegó a cocina · Vuelve a intentar» y el reintento —con la misma clave y
 * el mismo cuerpo— volvía a fallar igual: **desde la pantalla de inicio del mesero no
 * llegaba a cocina ni una comanda**. Las pruebas de la pantalla le pasaban la mesa ya
 * armada y la e2e mandaba el pedido por la API con `cantidad: '1'`; ninguna tocaba el
 * botón. Lo encontró el día completo, que comanda como lo hace Lupita.
 *
 * Aquí se arma UNA vez, y su prueba lo valida contra el esquema DEL COMANDO: si el
 * comando cambia de forma, falla la prueba y no el turno de la comida.
 */

/** Un renglón de la comanda, como lo pide `restaurante.enviar_pedido`. */
export interface LineaDelEnvio {
  readonly productoId: string;
  /** Unidades enteras de mesa, en la cadena decimal que exige el comando. */
  readonly cantidad: string;
}

/**
 * El borrador del mesero —producto → piezas por mandar— como renglones del envío. Lo que
 * no suma una pieza entera y positiva no viaja: un renglón en cero es un plato que la
 * cocina recibiría para no prepararlo.
 */
export function lineasDelEnvio(
  borrador: Readonly<Record<string, number>>,
): readonly LineaDelEnvio[] {
  return Object.entries(borrador)
    .filter(([, piezas]) => Number.isInteger(piezas) && piezas > 0)
    .map(([productoId, piezas]) => ({ productoId, cantidad: String(piezas) }));
}
