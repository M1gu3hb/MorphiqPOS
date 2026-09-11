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
  /**
   * La propina cobrada por ESTE método, exacta (F1-01 §3.3, F1-04 §38.2).
   *
   * Viaja aparte de `montoCentavos` y jamás se suma a él: si el comensal dejó 50
   * en efectivo y 30 en tarjeta, son 50 y 30, no un reparto proporcional sobre lo
   * que costó la comida. Y no entra en la comprobación de abajo: la propina no
   * paga la venta.
   */
  readonly propinaCentavos?: number | undefined;
  readonly recibidoCentavos?: number | undefined;
  readonly referencia?: string | undefined;
}

export interface PagoValidado {
  readonly metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  readonly montoCentavos: bigint;
  readonly propinaCentavos: bigint;
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
 *
 * **La propina viaja aparte y no cuenta para ese total.** Se acumula por método,
 * exacta, sin mezclarse con la venta (F1-04 §38.2, punto 2). El único sitio donde
 * las dos se suman es el efectivo recibido: el billete tiene que dar para las dos.
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
    // La propina NO entra en `suma`. Es la regla 1 de `F1-01` §3 escrita como
    // código: si contara para cubrir la venta, una propina de 100 dejaría pasar
    // un cobro de 100 menos, y el total quedaría inflado por esa diferencia.
    suma += monto;

    const propina = pago.propinaCentavos === undefined ? 0n : BigInt(pago.propinaCentavos);
    if (propina < 0n) {
      throw new ErrorDominio('PAGO_NO_CUADRA', 'Una propina no puede ser negativa.');
    }

    const recibido = pago.recibidoCentavos === undefined ? null : BigInt(pago.recibidoCentavos);

    // Sólo el efectivo devuelve cambio. El `check pago_cambio_solo_en_efectivo`
    // de la base lo impide también, pero fallar aquí da un mensaje legible en
    // vez de una violación de restricción.
    if (pago.metodo !== 'efectivo') {
      validados.push({
        metodo: pago.metodo,
        montoCentavos: monto,
        propinaCentavos: propina,
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

    // Y, si dejó propina, el billete tiene que dar también para ella. Es la
    // banda que la guarda de arriba no cubre —`monto <= recibido < monto +
    // propina`— y es el mismo `check pago_efectivo_recibido_suficiente` de la
    // base (`003:279-283`). Las dos condiciones son disjuntas a propósito: cada
    // una atiende un caso distinto y le dice al cajero cuál de los dos es. Sin
    // ésta el cambio saldría negativo y el cajón cerraría corto justo por el
    // importe de la propina.
    if (recibido !== null && propina > 0n && recibido < monto + propina) {
      throw new ErrorDominio(
        'EFECTIVO_INSUFICIENTE',
        'El efectivo recibido no alcanza para la venta y la propina.',
        { faltanCentavos: (monto + propina - recibido).toString() },
      );
    }

    validados.push({
      metodo: 'efectivo',
      montoCentavos: monto,
      propinaCentavos: propina,
      recibidoCentavos: recibido,
      cambioCentavos: recibido === null ? 0n : recibido - monto - propina,
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
