/**
 * Las cuentas del cobro de una nota en la caja de la ferretería que decide el MOSTRADOR:
 * cuánto dio el cliente, cuánto se le regresa y cómo se reparte un pago mixto.
 *
 * El total lo dice el servidor y el cambio también lo calcula él (`venta.cobrar` guarda
 * `cambio_centavos`); lo de aquí es para que la cajera lo vea ANTES de cobrar y el botón
 * no se encienda con menos dinero del que cuesta la nota. Sin React ni red, con sus
 * pruebas en `cobro-de-nota.test.ts`.
 */

export type MetodoDeDinero = 'efectivo' | 'tarjeta' | 'transferencia';

export interface PagoDeNota {
  readonly metodo: MetodoDeDinero;
  readonly montoCentavos: number;
  /** Sólo en efectivo: lo que puso el cliente. El servidor calcula el cambio con esto. */
  readonly recibidoCentavos?: number;
}

export type MontosDelMixto = Readonly<Record<MetodoDeDinero, number | null>>;

/** Los billetes con los que se paga de verdad, en centavos: $20, $50, $100, $200, $500, $1,000. */
const BILLETES = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000] as const;

/** Cuántos importes sugeridos caben debajo del campo sin empujar el botón de cobrar. */
const SUGERIDOS = 3;

/**
 * Lo que el cliente probablemente dio: el total redondeado hacia arriba a cada billete,
 * sin repetir y sin el exacto (que tiene su propio botón). En una ferretería los tickets
 * van de $40 a $6,000 y se pagan con billetes grandes: tocar «$500» es más rápido y
 * equivoca menos que teclear 5-0-0-punto-0-0 con gente detrás.
 */
export function billetesSugeridos(total: number): readonly number[] {
  if (total <= 0) return [];
  const redondeos = BILLETES.map((billete) => Math.ceil(total / billete) * billete).filter(
    (importe) => importe > total,
  );
  return [...new Set(redondeos)].toSorted((a, b) => a - b).slice(0, SUGERIDOS);
}

/** El cambio, o `null` si todavía no alcanza (o no se ha dicho cuánto dio). */
export function cambioDe(total: number, recibido: number | null): number | null {
  if (recibido === null || recibido < total) return null;
  return recibido - total;
}

/** Lo que FALTA en un mixto: positivo si falta, negativo si sobra, 0 si cuadra. */
export function faltaDelMixto(total: number, montos: MontosDelMixto): number {
  return total - (montos.efectivo ?? 0) - (montos.tarjeta ?? 0) - (montos.transferencia ?? 0);
}

/**
 * Los pagos de un mixto, en el orden en que se cuentan, sin los renglones vacíos.
 *
 * Lo recibido va SÓLO en el efectivo, y si no se dijo es lo exacto de esa parte: la
 * tarjeta y la transferencia no dan cambio (`pago_cambio_solo_en_efectivo`).
 */
export function pagosDelMixto(
  montos: MontosDelMixto,
  recibidoEfectivo: number | null,
): readonly PagoDeNota[] {
  const pagos: PagoDeNota[] = [];
  const efectivo = montos.efectivo ?? 0;
  if (efectivo > 0) {
    pagos.push({
      metodo: 'efectivo',
      montoCentavos: efectivo,
      recibidoCentavos: recibidoEfectivo ?? efectivo,
    });
  }
  for (const metodo of ['tarjeta', 'transferencia'] as const) {
    const monto = montos[metodo] ?? 0;
    if (monto > 0) pagos.push({ metodo, montoCentavos: monto });
  }
  return pagos;
}

/** El cambio de un mixto: sobre la parte en efectivo, y `null` si lo dado no la cubre. */
export function cambioDelMixto(
  montos: MontosDelMixto,
  recibidoEfectivo: number | null,
): number | null {
  const efectivo = montos.efectivo ?? 0;
  if (efectivo === 0) return 0;
  return cambioDe(efectivo, recibidoEfectivo ?? efectivo);
}
