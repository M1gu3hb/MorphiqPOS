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
 * Si lo que entra por ese método no alcanza ni para la propina, se dice antes de mandar.
 *
 * Y la operación más normal de un restaurante —la cuenta entera con tarjeta y la propina
 * SÓLO en billete— se rechazaba aquí: se exigía que el efectivo cubriera «la propina y
 * algo de la cuenta». Ahora ese renglón viaja como lo que es, sólo propina, sin inventarle
 * un centavo de venta; el servidor y la base lo admiten desde la 184. Con un solo método,
 * la propina también puede irse por otro sin pasar por «Mixto».
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
  if (importe < propina) {
    return `La propina se pagó con ${metodoDePropina}, y lo que entra por ${metodoDePropina} no alcanza para ella.`;
  }
  return null;
}

/** Lo que el billete de «Recibido» tiene que cubrir: la venta, más la propina si va en efectivo. */
export function aCubrirEnEfectivo(
  metodo: Metodo,
  venta: number,
  propina: number,
  metodoDePropina: MetodoBase,
): number {
  if (metodo !== 'efectivo') return 0;
  return venta + (metodoDePropina === 'efectivo' ? propina : 0);
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
    if (propina <= 0 || metodoDePropina === metodo) {
      return [{ metodo, montoCentavos: venta, propinaCentavos: propina, ...enMano }];
    }
    // La cuenta por un método y la propina por otro: el renglón de la propina no lleva venta.
    return [
      { metodo, montoCentavos: venta, propinaCentavos: 0, ...enMano },
      { metodo: metodoDePropina, montoCentavos: 0, propinaCentavos: propina },
    ];
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
 * LO QUE EL COMENSAL ESCRIBIÓ EN SU TELÉFONO (día completo del restaurante, 2.4).
 *
 * Un comensal que escribe «otro monto» en el portal deja `monto_manual` con origen `portal_qr`.
 * La orden no guarda el importe —no tiene dónde—, sólo los puntos base que salen de él
 * (`portal.pedir_cuenta`), y el muro de la caja se ponía, bien, pero A CIEGAS: la cajera no veía
 * qué había escrito el comensal y tenía que preguntárselo de memoria. El cobro heredado enseñaba
 * el importe «para que el cajero lo confirme» (`Caja.jsx`, `propinaDerivada`); aquí se DICE, sin
 * prellenar nada: la que confirma es la cajera, y lo que se cobra es lo que ella teclea.
 *
 * Es una CIFRA APROXIMADA, y la pantalla lo dice («cerca de»): los puntos base son enteros, así
 * que un importe a mano que no es un porcentaje redondo vuelve con unos centavos de diferencia
 * —$50.00 sobre $1,210.00 vuelve como $49.97—. El importe exacto vive sólo en el aviso al mesero
 * (`solicitudes_qr.propina_sugerida_centavos`), que no siempre existe: arreglarlo de raíz es una
 * columna en `ordenes`, fuera de esta pantalla.
 *
 * `null` cuando no hay nada fiable que decir: no es un monto del portal, no hay puntos base, o los
 * puntos llegan al tope de 100 % —el portal recorta ahí la propina que supera la cuenta, y ese
 * número ya no es lo que el comensal escribió—.
 */
export function propinaDelComensal(
  ventaCentavos: number,
  cuenta: PropinaDeLaCuenta,
): number | null {
  if (cuenta.tipo !== 'monto_manual' || cuenta.origen !== 'portal_qr') return null;
  const puntosBase = Math.round((cuenta.porcentaje ?? 0) * 100);
  if (puntosBase <= 0 || puntosBase >= PUNTOS_BASE_DE_LA_CUENTA || ventaCentavos <= 0) return null;
  return Number(aplicarPorcentaje(centavos(ventaCentavos), puntosBase));
}

/** El tope de los puntos base de una orden: la cuenta entera (`check … between 0 and 10000`). */
const PUNTOS_BASE_DE_LA_CUENTA = 10_000;

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
