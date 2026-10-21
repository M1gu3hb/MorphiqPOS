/**
 * QUÉ CUENTAS SON UNA VENTA EN EL REGISTRO (día completo del restaurante, 2.4).
 *
 * La pestaña «Ventas» de Registros leía TODAS las cuentas del negocio y sumaba el `total` de cada
 * una en el resumen del periodo. Pero una cuenta sólo es una venta cuando se cobró: la que se
 * canceló no cobró nada, y la «madre» de una división tampoco —quien cobró fueron sus dos hijas,
 * que ya estaban en la lista—. El día completo lo destapó cuando la dueña vuelve a entrar con su
 * PIN: el sábado vendió $5,699.40 y el resumen decía $7,520.40, con 11 «ventas» donde había 9.
 * Los $1,821.00 de más eran la cuenta cancelada de la mesa 6 y la madre de la mesa 9, contados
 * como dinero que entró. Es la pantalla donde el dueño mira cuánto vendió.
 *
 * Lo mismo habría pasado con una cuenta que sigue abierta, en cuenta pedida o apartada: todas
 * tienen `total` y ninguna ha cobrado. Y como no tienen fecha de cierre, además se saltaban el
 * filtro del periodo y salían en «Hoy» cualquiera que fuera su día.
 *
 * ── Qué cuenta como cobrada ──────────────────────────────────────────────────
 * Lo mismo que la conciliación del día (`COBRADAS`): `pagada`, y las dos que ya recibieron su
 * dinero y luego devolvieron algo, `parcialmente_reembolsada` y `reembolsada`. La devolución es
 * otro movimiento y otra pantalla; la venta se hizo y tiene su folio.
 *
 * Es una función pura sobre la fila cruda del puente, para probarla sin navegador.
 */

/** Los estados de una cuenta que ya recibió su dinero (`ordenes_estado_check`). */
export const ESTADOS_DE_UNA_VENTA_COBRADA: readonly string[] = [
  'pagada',
  'parcialmente_reembolsada',
  'reembolsada',
];

/** ¿Esta fila del puente es una venta cobrada? Sin estado legible no se cuenta como venta. */
export function esVentaCobrada(fila: Readonly<Record<string, unknown>>): boolean {
  const estado = fila['estado'];
  return typeof estado === 'string' && ESTADOS_DE_UNA_VENTA_COBRADA.includes(estado);
}
