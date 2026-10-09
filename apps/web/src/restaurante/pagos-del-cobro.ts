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

import { aplicarPorcentaje, centavos } from '@morphiqpos/domain/dinero';

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

/**
 * LA PROPINA QUE EL MESERO YA ACORDÓ EN LA MESA (día completo del restaurante, 2.4).
 *
 * `02-DINERO-Y-CAJA` §4.3: la propina se decide en tres momentos, y el primero es el
 * mesero en la mesa, preguntándole al comensal. `solicitar_cuenta` guarda lo que eligió
 * —`propina_tipo` y `propina_puntos_base`— y NO un importe: la propina vive en `pagos`, y
 * antes del cobro la vista sólo sirve los puntos base. El cobro del modelo leía
 * `propina_monto` —que antes de cobrar no existe— y nada más, así que:
 *
 *   · el «10 %» que el mesero acordó con la mesa se cobraba como CERO, sin muro y sin
 *     aviso: el comensal pagaba la venta y el mesero perdía su propina;
 *   · un MONTO tecleado por el mesero (`monto_manual`) ni siquiera viaja —el comando sólo
 *     lleva puntos base— y también se cobraba como cero.
 *
 * Es la misma regla que el cobro heredado de Miguel lleva meses aplicando
 * (`tipsUtils.js`, `propinaDerivada` y `requiereConfirmarPropinaAntesDeCobrar`): el
 * porcentaje se deriva de la venta, en centavos y con el redondeo del dominio —el mismo de
 * la precuenta—, y un monto a mano que no confirmó la caja exige el muro.
 */
const PROPINA_SIN_DECIDIR: readonly string[] = [
  'pendiente',
  'pendiente_cliente',
  'decidir_en_caja',
];

export interface PropinaDeLaCuenta {
  /** `propina_tipo` de la cuenta: quién y cómo la decidió. */
  readonly tipo: string | null;
  /** `propina_origen`: un monto a mano que ya confirmó la caja no se vuelve a preguntar. */
  readonly origen: string | null;
  /** `propina_porcentaje` del puente: el PORCENTAJE (10, 12.5), no los puntos base. */
  readonly porcentaje: number | null;
  /** Lo ya pagado de propina, en centavos (`propina_monto`), o `null` antes del cobro. */
  readonly pagadaCentavos: number | null;
}

/** ¿Hay que poner el muro de la propina antes de cobrar? */
export function propinaPorConfirmar(cuenta: PropinaDeLaCuenta): boolean {
  if (PROPINA_SIN_DECIDIR.includes(cuenta.tipo ?? '')) return true;
  return cuenta.tipo === 'monto_manual' && cuenta.origen !== 'caja';
}

/**
 * La propina que va en el cobro si la caja no eligió otra: la ya pagada, o el porcentaje
 * que acordó el mesero sobre la venta. Cualquier otro caso, cero —y si hacía falta
 * preguntar, el muro de `propinaPorConfirmar` lo hace antes—.
 */
export function propinaPrevista(ventaCentavos: number, cuenta: PropinaDeLaCuenta): number {
  if (cuenta.pagadaCentavos !== null && cuenta.pagadaCentavos > 0) return cuenta.pagadaCentavos;
  if (cuenta.tipo !== 'porcentaje') return 0;
  const puntosBase = Math.round((cuenta.porcentaje ?? 0) * 100);
  if (puntosBase <= 0 || ventaCentavos <= 0) return 0;
  return Number(aplicarPorcentaje(centavos(ventaCentavos), puntosBase));
}
