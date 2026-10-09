/**
 * LOS RENGLONES DE PAGO del cobro del restaurante, sin pantalla (auditoría de la 2.4).
 *
 * La propina de un pago MIXTO se repartía «de efectivo hacia abajo»: lo primero que
 * cubría la propina era el efectivo, dijera lo que dijera el comensal. Eso no es el
 * desglose exacto que pide la regla del dinero —la propina por método es la que fue—, y
 * además rompía: venta $200, propina $50, efectivo $50 + tarjeta $200 mandaba un renglón
 * de efectivo con importe CERO y el servidor rechazaba el cobro.
 *
 * Ahora quien cobra dice CON QUÉ se pagó la propina, y la propina sale de ese método.
 * Si ese método no alcanza a cubrir la propina y algo de la venta, se dice antes de mandar.
 */

export type MetodoBase = 'efectivo' | 'tarjeta' | 'transferencia';
export type Metodo = MetodoBase | 'mixto';

export const BASES: readonly MetodoBase[] = ['efectivo', 'tarjeta', 'transferencia'];

export interface RenglonDePago {
  readonly metodo: MetodoBase;
  readonly montoCentavos: number;
  readonly propinaCentavos: number;
  readonly recibidoCentavos?: number;
}

/** Por qué no se puede repartir la propina del mixto así, o `null` si se puede. */
export function problemaDeLaPropina(
  partes: Readonly<Record<MetodoBase, number | null>>,
  propina: number,
  metodoDePropina: MetodoBase,
): string | null {
  if (propina <= 0) return null;
  const importe = partes[metodoDePropina] ?? 0;
  if (importe <= propina) {
    return `La propina va con ${metodoDePropina}: ese importe tiene que cubrir la propina y algo de la cuenta.`;
  }
  return null;
}

export function renglonesDePago(
  metodo: Metodo,
  partes: Readonly<Record<MetodoBase, number | null>>,
  venta: number,
  propina: number,
  recibido: number | null,
  metodoDePropina: MetodoBase,
): readonly RenglonDePago[] {
  if (metodo !== 'mixto') {
    const enMano =
      metodo === 'efectivo' && recibido !== null && recibido > 0
        ? { recibidoCentavos: recibido }
        : {};
    return [{ metodo, montoCentavos: venta, propinaCentavos: propina, ...enMano }];
  }
  return BASES.map((base) => {
    const importe = partes[base] ?? 0;
    const suya = base === metodoDePropina ? propina : 0;
    return { metodo: base, montoCentavos: importe - suya, propinaCentavos: suya };
  }).filter((renglon) => renglon.montoCentavos > 0 || renglon.propinaCentavos > 0);
}
