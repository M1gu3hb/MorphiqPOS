import { repartirPagos, type PagoEntrante, type PagoValidado } from '../venta/pagos.ts';
import type { Azar } from './historial-azar.ts';

/**
 * Cómo paga una cuenta del historial y cuánto deja de propina.
 *
 * Reproduce lo que hace un cobro de verdad —`repartirPagos` es la MISMA función pura que usa
 * `venta.cobrar`—, así que el cambio, el efectivo recibido y la regla de que la propina no paga
 * la venta salen de un solo sitio. Lo que se inventa aquí es la costumbre de la gente:
 * qué método usa, cuánto deja, y en qué lo deja —la cuenta con tarjeta y la propina en billete
 * es lo más normal de un restaurante (D-46)—.
 */

export type TipoDePropina = 'sin_propina' | 'porcentaje' | 'monto_manual';
export type OrigenDePropina = 'mesero' | 'caja' | 'tradicional' | 'portal_qr';

export interface PropinaPlaneada {
  readonly totalCentavos: bigint;
  /** 1500 = 15 %. Cero cuando la propina fue un monto a mano. */
  readonly puntosBase: number;
  readonly tipo: TipoDePropina;
  readonly origen: OrigenDePropina;
}

export interface CobroPlaneado {
  readonly pagos: readonly PagoValidado[];
  readonly propina: PropinaPlaneada;
}

const UN_PESO = 100n;
const DIEZ_PESOS = 1_000n;
const CIEN_POR_CIENTO = 100n;
/** Treinta pesos: por debajo de esto un pago mixto no tiene sentido. */
const CUENTA_MINIMA_PARA_PARTIR = 3_000n;

type Metodo = 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

const METODOS_EN_MESA = [
  { valor: 'efectivo', peso: 40 },
  { valor: 'tarjeta', peso: 42 },
  { valor: 'transferencia', peso: 8 },
  { valor: 'mixto', peso: 10 },
] as const;

const METODOS_PARA_LLEVAR = [
  { valor: 'efectivo', peso: 45 },
  { valor: 'tarjeta', peso: 45 },
  { valor: 'transferencia', peso: 10 },
] as const;

const PORCENTAJES_EN_MESA = [
  { valor: 0, peso: 7 },
  { valor: 10, peso: 18 },
  { valor: 12, peso: 5 },
  { valor: 15, peso: 45 },
  { valor: 18, peso: 7 },
  { valor: 20, peso: 18 },
] as const;

const PORCENTAJES_PARA_LLEVAR = [
  { valor: 0, peso: 65 },
  { valor: 10, peso: 20 },
  { valor: 15, peso: 15 },
] as const;

/** Con cuánto paga el cliente un importe en efectivo: exacto, o con el billete que le sigue. */
const BILLETES = [
  { valor: 1n, peso: 15 },
  { valor: 2_000n, peso: 10 },
  { valor: 5_000n, peso: 20 },
  { valor: 10_000n, peso: 35 },
  { valor: 20_000n, peso: 12 },
  { valor: 50_000n, peso: 8 },
] as const;

function redondearA(valor: bigint, multiplo: bigint): bigint {
  return ((valor + multiplo / 2n) / multiplo) * multiplo;
}

function sobreElImporte(valor: bigint, multiplo: bigint): bigint {
  return ((valor + multiplo - 1n) / multiplo) * multiplo;
}

/** El efectivo que se recibe para cubrir `importe`: nunca menos, casi siempre un billete más. */
function recibidoPara(azar: Azar, importe: bigint): bigint {
  const utiles = BILLETES.filter((b) => b.valor === 1n || b.valor <= importe * 2n + 5_000n);
  const billete = azar.ponderado(utiles);
  return billete === 1n ? importe : sobreElImporte(importe, billete);
}

function propinaExacta(total: bigint, porcentaje: number): bigint {
  return (total * BigInt(porcentaje)) / CIEN_POR_CIENTO;
}

/** La propina en billete se redondea a diez pesos; la de tarjeta, al peso. */
function propinaEnBillete(total: bigint, porcentaje: number): bigint {
  const exacta = propinaExacta(total, porcentaje);
  const redondeada = redondearA(exacta, DIEZ_PESOS);
  return redondeada > 0n ? redondeada : DIEZ_PESOS;
}

function propinaEnTarjeta(total: bigint, porcentaje: number): bigint {
  const redondeada = redondearA(propinaExacta(total, porcentaje), UN_PESO);
  return redondeada > 0n ? redondeada : UN_PESO;
}

function referenciaDe(azar: Azar, prefijo: string): string {
  return `${prefijo}${String(azar.entero(100_000, 999_999))}`;
}

function renglonDeEfectivo(azar: Azar, monto: bigint, propina: bigint): PagoEntrante {
  return {
    metodo: 'efectivo',
    montoCentavos: Number(monto),
    propinaCentavos: Number(propina),
    recibidoCentavos: Number(recibidoPara(azar, monto + propina)),
  };
}

function renglonSinCambio(
  azar: Azar,
  metodo: 'tarjeta' | 'transferencia',
  monto: bigint,
  propina: bigint,
): PagoEntrante {
  return {
    metodo,
    montoCentavos: Number(monto),
    propinaCentavos: Number(propina),
    referencia: referenciaDe(azar, metodo === 'tarjeta' ? 'AUT' : 'SPEI'),
  };
}

function escogerMetodo(azar: Azar, esMesa: boolean, total: bigint): Metodo {
  const metodo: Metodo = azar.ponderado(esMesa ? METODOS_EN_MESA : METODOS_PARA_LLEVAR);
  // Una cuenta tan chica no se parte en dos formas de pago: se paga de un golpe.
  return metodo === 'mixto' && total < CUENTA_MINIMA_PARA_PARTIR ? 'tarjeta' : metodo;
}

/** Los renglones de pago y la propina de UNA cuenta. */
export function planearCobro(azar: Azar, total: bigint, esMesa: boolean): CobroPlaneado {
  const porcentaje = azar.ponderado(esMesa ? PORCENTAJES_EN_MESA : PORCENTAJES_PARA_LLEVAR);
  const metodo = escogerMetodo(azar, esMesa, total);
  const quiereBillete = azar.probabilidad(metodo === 'transferencia' ? 0.5 : 0.35);
  const dejaPropina = porcentaje > 0;

  let entrantes: PagoEntrante[];
  let enBillete: boolean;

  if (metodo === 'efectivo') {
    enBillete = dejaPropina;
    const propina = dejaPropina ? propinaEnBillete(total, porcentaje) : 0n;
    entrantes = [renglonDeEfectivo(azar, total, propina)];
  } else if (metodo === 'mixto') {
    const parteEnEfectivo = redondearA(
      (total * BigInt(azar.entero(30, 60))) / CIEN_POR_CIENTO,
      UN_PESO,
    );
    const efectivo = parteEnEfectivo < UN_PESO ? UN_PESO : parteEnEfectivo;
    enBillete = dejaPropina && quiereBillete;
    const propinaBillete = enBillete ? propinaEnBillete(total, porcentaje) : 0n;
    const propinaTarjeta = dejaPropina && !enBillete ? propinaEnTarjeta(total, porcentaje) : 0n;
    entrantes = [
      renglonDeEfectivo(azar, efectivo, propinaBillete),
      renglonSinCambio(azar, 'tarjeta', total - efectivo, propinaTarjeta),
    ];
  } else {
    enBillete = dejaPropina && quiereBillete;
    const propinaElectronica = dejaPropina && !enBillete ? propinaEnTarjeta(total, porcentaje) : 0n;
    entrantes = [renglonSinCambio(azar, metodo, total, propinaElectronica)];
    if (enBillete) {
      // La cuenta entera con tarjeta y la propina en billete: un renglón de efectivo SIN venta.
      entrantes.push(renglonDeEfectivo(azar, 0n, propinaEnBillete(total, porcentaje)));
    }
  }

  const pagos = repartirPagos(entrantes, total);
  const propinaTotal = pagos.reduce((suma, p) => suma + p.propinaCentavos, 0n);
  return { pagos, propina: describirPropina(azar, propinaTotal, porcentaje, enBillete) };
}

function describirPropina(
  azar: Azar,
  total: bigint,
  porcentaje: number,
  enBillete: boolean,
): PropinaPlaneada {
  if (total === 0n) {
    return { totalCentavos: 0n, puntosBase: 0, tipo: 'sin_propina', origen: 'caja' };
  }
  if (enBillete) {
    return {
      totalCentavos: total,
      puntosBase: 0,
      tipo: 'monto_manual',
      origen: azar.elegir<OrigenDePropina>(['mesero', 'mesero', 'caja', 'tradicional']),
    };
  }
  return {
    totalCentavos: total,
    puntosBase: porcentaje * 100,
    tipo: 'porcentaje',
    origen: azar.elegir<OrigenDePropina>(['caja', 'caja', 'mesero', 'portal_qr']),
  };
}
