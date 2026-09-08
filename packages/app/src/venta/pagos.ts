import { ErrorDominio } from '@morphiqpos/contracts';

/**
 * Reparto y comprobación de los pagos de una venta (F1.1-A-09).
 *
 * Corrige P1-11. En las dos fuentes el pago eran columnas dentro de la venta
 * —`monto_efectivo`, `monto_tarjeta`— y el sincronizador acabó mapeando todo a
 * efectivo, así que el arqueo pedía billetes por ventas cobradas con tarjeta.
 * Aquí **un pago mixto son varias filas**, cada una con su método.
 *
 * Es una función pura a propósito: es donde se decide si lo que puso el cliente
 * cuadra con lo que cuesta, y eso merece prueba y mutación sin base de datos.
 */

export interface PagoEntrante {
  readonly metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  readonly montoCentavos: number;
  readonly recibidoCentavos?: number | undefined;
  readonly referencia?: string | undefined;
}

export interface PagoValidado {
  readonly metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  readonly montoCentavos: bigint;
  readonly recibidoCentavos: bigint | null;
  readonly cambioCentavos: bigint;
  readonly referencia: string | null;
}

/**
 * Comprueba que los pagos suman EXACTAMENTE el total, y calcula el cambio.
 *
 * Exactamente, no «al menos»: si sumaran de más, la diferencia se quedaría en
 * la caja sin registrar y el arqueo saldría sobrado sin que nadie sepa de qué
 * venta salió. El vuelto se devuelve por el `recibido` del renglón de efectivo,
 * que es donde de verdad ocurre.
 */
export function repartirPagos(
  entrantes: readonly PagoEntrante[],
  totalCentavos: bigint,
): PagoValidado[] {
  if (entrantes.length === 0) {
    throw new ErrorDominio('PAGO_NO_CUADRA', 'Hace falta al menos una forma de pago.');
  }

  const validados: PagoValidado[] = [];
  let suma = 0n;

  for (const pago of entrantes) {
    const monto = BigInt(pago.montoCentavos);
    if (monto <= 0n) {
      throw new ErrorDominio('PAGO_NO_CUADRA', 'Cada forma de pago debe ser mayor que cero.');
    }
    suma += monto;

    const recibido = pago.recibidoCentavos === undefined ? null : BigInt(pago.recibidoCentavos);

    // Sólo el efectivo devuelve cambio. El `check pago_cambio_solo_en_efectivo`
    // de la base lo impide también, pero fallar aquí da un mensaje legible en
    // vez de una violación de restricción.
    if (pago.metodo !== 'efectivo') {
      validados.push({
        metodo: pago.metodo,
        montoCentavos: monto,
        recibidoCentavos: null,
        cambioCentavos: 0n,
        referencia: pago.referencia ?? null,
      });
      continue;
    }

    if (recibido !== null && recibido < monto) {
      throw new ErrorDominio(
        'EFECTIVO_INSUFICIENTE',
        'El efectivo recibido no alcanza para ese importe.',
        { faltanCentavos: (monto - recibido).toString() },
      );
    }

    validados.push({
      metodo: 'efectivo',
      montoCentavos: monto,
      recibidoCentavos: recibido,
      cambioCentavos: recibido === null ? 0n : recibido - monto,
      referencia: pago.referencia ?? null,
    });
  }

  if (suma !== totalCentavos) {
    throw new ErrorDominio(
      'PAGO_NO_CUADRA',
      suma < totalCentavos ? 'Falta dinero para cubrir la venta.' : 'El pago excede el total.',
      { totalCentavos: totalCentavos.toString(), pagadoCentavos: suma.toString() },
    );
  }

  return validados;
}
