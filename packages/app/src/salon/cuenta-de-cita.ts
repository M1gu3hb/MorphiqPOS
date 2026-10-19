import { ErrorDominio } from '@morphiqpos/contracts';
import { aplicarPorcentaje, centavos } from '@morphiqpos/domain/dinero';
import { calcularTotales, impuestoExtraido, type ReglaImpuesto } from '@morphiqpos/domain/venta';

import {
  FACTOR_PROPINA_SOBRE_VENTA,
  MAXIMO_PROPINA_CENTAVOS,
  PISO_PROPINA_CENTAVOS,
} from '../propinas/esquemas.ts';

/**
 * LA CUENTA DE UNA CITA, sin base de datos: cuánto cuesta, cuánto se descuenta, qué
 * parte es IVA, cuánto trae de anticipo y cuánto queda por cobrar.
 *
 * ── Por qué vive aparte del comando ──────────────────────────────────────
 * Porque la usan DOS: el cobro y su cotización. La pantalla enseña «el ticket baja
 * de $1,130 a $904 y tu comisión de $565 a $452» ANTES de aplicar el descuento
 * (`02-DINERO-Y-CAJA §3`), y si esa cifra se calculara en otro sitio que el cobro,
 * la estilista vería un número y cobraría otro. Es la misma razón por la que
 * `venta/cotizar.ts` existe como función y no sólo como comando.
 *
 * ── Lo que decide cada pieza, contra el documento del giro ───────────────
 * - El IVA se EXTRAE del total una sola vez, con la regla del negocio (§2.1): el
 *   precio al público ya lo lleva dentro.
 * - La propina no entra en ninguna de estas cifras (§2.2): se cuenta aparte, con su
 *   camino, y nunca toca la base del IVA ni la venta.
 * - El anticipo baja lo que se cobra HOY, no lo que cuesta la cita (§6.1): la venta
 *   se reconoce completa el día del servicio.
 * - El descuento se reparte entre las líneas en proporción a su precio, al centavo,
 *   porque la comisión se calcula por línea y cada línea puede ser de otra persona.
 */

/** Los tres caminos por los que entra una propina en el salón (§4.2). */
export const CAMINOS_DE_PROPINA = ['mano', 'cajon', 'terminal'] as const;
export type CaminoDePropina = (typeof CAMINOS_DE_PROPINA)[number];

export interface CuentaDeCita {
  /** La suma de los precios congelados al agendar: el precio de lista de la cita. */
  readonly listaCentavos: bigint;
  readonly descuentoCentavos: bigint;
  /** El descuento de cada línea, en el orden de `precios`. Suma `descuentoCentavos`. */
  readonly descuentoPorLinea: readonly bigint[];
  /** El IVA que va DENTRO del total (o encima, si el negocio no lo incluye). */
  readonly impuestosCentavos: bigint;
  /** Lo que cuesta la cita: la venta que se reconoce hoy. */
  readonly totalCentavos: bigint;
  readonly anticipoCentavos: bigint;
  /** Lo que la clienta paga HOY: el total menos el anticipo que ya dejó. */
  readonly porCobrarCentavos: bigint;
}

/**
 * Reparte un descuento entre líneas en proporción a su precio, al centavo exacto.
 *
 * Cada línea recibe la parte entera de su proporción y los centavos que sobran van,
 * uno por uno, a las de mayor residuo —las primeras, si empatan—. Así la suma es el
 * descuento EXACTO: un reparto que redondeara cada línea por su cuenta podría sumar
 * un centavo de más o de menos, y ese centavo acabaría en la comisión de alguien.
 */
export function repartirDescuento(
  precios: readonly bigint[],
  descuento: bigint,
): readonly bigint[] {
  const lista = precios.reduce((a, p) => a + p, 0n);
  if (descuento === 0n || lista === 0n) return precios.map(() => 0n);

  const partes = precios.map((precio, indice) => ({
    indice,
    entera: (descuento * precio) / lista,
    residuo: (descuento * precio) % lista,
  }));
  let sobran = descuento - partes.reduce((a, p) => a + p.entera, 0n);
  const porResiduo = partes.toSorted((a, b) =>
    a.residuo === b.residuo ? a.indice - b.indice : a.residuo > b.residuo ? -1 : 1,
  );
  const extra = new Set<number>();
  for (const parte of porResiduo) {
    if (sobran === 0n) break;
    extra.add(parte.indice);
    sobran -= 1n;
  }
  return partes.map((p) => p.entera + (extra.has(p.indice) ? 1n : 0n));
}

/**
 * La cuenta completa de la cita.
 *
 * `descuentoBp` es el porcentaje en puntos base (10 % = 1000), y el importe sale
 * redondeado al centavo como el resto del sistema (`aplicarPorcentaje`).
 */
export function cuentaDeCita(
  precios: readonly bigint[],
  descuentoBp: number,
  anticipo: bigint,
  impuesto: ReglaImpuesto,
): CuentaDeCita {
  const lista = precios.reduce((a, p) => a + p, 0n);
  const descuento = aplicarPorcentaje(centavos(lista), descuentoBp);
  const descuentoPorLinea = repartirDescuento(precios, descuento);

  const totales = calcularTotales(
    precios.map((precio, indice) => ({
      subtotalCentavos: centavos(precio),
      descuentoCentavos: centavos(descuentoPorLinea[indice] ?? 0n),
    })),
    impuesto,
  );

  if (anticipo > totales.totalCentavos) {
    // El anticipo no se parte: la 138 guarda UN monto por anticipo y lo aplica
    // entero. Cobrar con uno mayor que la cuenta dejaría un sobrante que nadie
    // devuelve —y que la clienta sí recuerda—.
    throw new ErrorDominio(
      'PAGO_NO_CUADRA',
      'El anticipo es mayor que lo que cuesta la cita: devuélvele la diferencia antes de cobrar.',
      { anticipo: anticipo.toString(), total: totales.totalCentavos.toString() },
    );
  }

  return {
    listaCentavos: lista,
    descuentoCentavos: totales.descuentoCentavos,
    descuentoPorLinea,
    impuestosCentavos: totales.impuestosCentavos,
    totalCentavos: totales.totalCentavos,
    anticipoCentavos: anticipo,
    porCobrarCentavos: totales.totalCentavos - anticipo,
  };
}

export interface BaseDeLinea {
  readonly cobradoSinIvaCentavos: bigint;
  readonly listaSinIvaCentavos: bigint;
  readonly ivaCentavos: bigint;
}

/**
 * Lo cobrado y la lista de UNA línea, SIN IVA: la base de su comisión.
 *
 * «Por omisión: sobre el importe sin IVA, porque el IVA no es ingreso del salón»
 * (§7.2, pregunta 2). Antes el cobro comisionaba el precio al público entero: un
 * servicio de $950 pagaba 50 % de $950 en vez de 50 % de $819 —$66 de más por
 * servicio—, con la regla diciendo `sobre_iva = false`.
 */
export function baseDeLinea(
  precio: bigint,
  descuentoDeLinea: bigint,
  impuesto: ReglaImpuesto,
): BaseDeLinea {
  const cobrado = precio - descuentoDeLinea;
  if (!impuesto.incluidoEnPrecio) {
    return {
      cobradoSinIvaCentavos: cobrado,
      listaSinIvaCentavos: precio,
      ivaCentavos: aplicarPorcentaje(centavos(cobrado), impuesto.tasaPuntosBase),
    };
  }
  const iva = impuestoExtraido(centavos(cobrado), impuesto.tasaPuntosBase);
  return {
    cobradoSinIvaCentavos: cobrado - iva,
    listaSinIvaCentavos: precio - impuestoExtraido(centavos(precio), impuesto.tasaPuntosBase),
    ivaCentavos: iva,
  };
}

export interface PropinaPedida {
  readonly profesionalId: string;
  readonly montoCentavos: number;
  readonly camino: CaminoDePropina;
}

export interface PagoPedido {
  readonly metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  readonly montoCentavos: number;
}

export interface PropinasPorCamino {
  readonly mano: bigint;
  readonly cajon: bigint;
  readonly terminal: bigint;
}

/**
 * Suma las propinas por camino y comprueba que cada una tenga por dónde entrar.
 *
 * - La de TERMINAL va en el cargo de la tarjeta: sin un pago con tarjeta en el
 *   cobro, no hay cargo que la lleve.
 * - La de CAJÓN es el cambio que la clienta deja en efectivo: sin un pago en
 *   efectivo, ese dinero no entró por aquí. Si pagó con tarjeta y le dio un billete
 *   a la estilista, es propina A LA MANO.
 * - La de la MANO no pasa por el salón: se registra y no mueve nada.
 *
 * Y el tope de siempre (`propinas/esquemas.ts`): diez veces la venta con un piso de
 * mil pesos, y nunca más de cien mil. Un cero de más en la propina es un arqueo que
 * pide noventa mil pesos que no existen.
 */
export function propinasPorCamino(
  propinas: readonly PropinaPedida[],
  pagos: readonly PagoPedido[],
  ventaCentavos: bigint,
): PropinasPorCamino {
  const suma = (camino: CaminoDePropina) =>
    propinas.filter((p) => p.camino === camino).reduce((a, p) => a + BigInt(p.montoCentavos), 0n);
  const porCamino = { mano: suma('mano'), cajon: suma('cajon'), terminal: suma('terminal') };

  if (porCamino.terminal > 0n && !pagos.some((p) => p.metodo === 'tarjeta')) {
    throw new ErrorDominio(
      'PAGO_NO_CUADRA',
      'La propina en terminal va en el cargo de la tarjeta, y este cobro no lleva tarjeta.',
    );
  }
  if (porCamino.cajon > 0n && !pagos.some((p) => p.metodo === 'efectivo')) {
    throw new ErrorDominio(
      'PAGO_NO_CUADRA',
      'La propina al cajón es el efectivo que deja la clienta, y este cobro no lleva efectivo. Si se la dio en la mano, anótala a la mano.',
    );
  }

  const total = porCamino.mano + porCamino.cajon + porCamino.terminal;
  const tope = ventaCentavos * BigInt(FACTOR_PROPINA_SOBRE_VENTA);
  const topeFinal = tope > BigInt(PISO_PROPINA_CENTAVOS) ? tope : BigInt(PISO_PROPINA_CENTAVOS);
  if (total > topeFinal || total > BigInt(MAXIMO_PROPINA_CENTAVOS)) {
    throw new ErrorDominio(
      'PAGO_NO_CUADRA',
      'Esa propina no cuadra con el servicio: revisa que no lleve un cero de más.',
      { propina: total.toString() },
    );
  }
  return porCamino;
}
