import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-257 · El redondeo de cambio.
 *
 * ── Por qué esto merece código ───────────────────────────────────────────
 * «No tengo cambio, ¿le doy un chicle?» pasa veinte veces al día en una
 * tiendita y hoy no existe en ningún sitio: el chicle sale del anaquel sin
 * registro y el cajón descuadra por pesos sueltos que a fin de mes son cientos.
 * Es el tipo de cosa que hace que el arqueo no cuadre NUNCA por poquito, y un
 * descuadre chico es peor que uno grande: el grande se busca, el chico se
 * asume, y en cuanto se asume el arqueo deja de detectar el robo, que es para
 * lo que existe.
 *
 * ── Lo que aquí NO se decide ─────────────────────────────────────────────
 * No se decide si el cliente acepta. El redondeo a favor es un acuerdo, no una
 * facultad: quien lo teclea es quien acaba de pedirlo en voz alta. Esto sólo
 * calcula cuánto sobra y hacia dónde, para que lo que se teclee sea lo que pasó.
 *
 * ── Por qué NO vive en `redondeo.ts` ─────────────────────────────────────
 * Porque aquel es la única definición de redondeo ARITMÉTICO del sistema —la
 * media que se aleja del cero, sobre la que se calculan todos los totales— y
 * esto es otra cosa: un acuerdo de mostrador sobre monedas que no hay. Mezclar
 * las dos haría que tocar el redondeo del cambio pudiera mover el IVA.
 */

export type TipoRedondeo = 'a_favor' | 'en_contra' | 'especie';

/** Un peso. Por encima de eso no es un redondeo: es un descuento sin autorizar. */
export const TOPE_REDONDEO_CENTAVOS = 100n;

export interface CambioRedondeado {
  /** Lo que de verdad se entrega en monedas. */
  readonly entregadoCentavos: bigint;
  /** Lo que sobra, con signo: positivo a favor del negocio. */
  readonly residuoCentavos: bigint;
  /** `null` cuando el cambio cabe exacto y no hay nada que registrar. */
  readonly tipo: TipoRedondeo | null;
}

/**
 * Cuánto se entrega y cuánto sobra, con la moneda más chica que hay en el cajón.
 *
 * ── Por qué la dirección se elige y no se impone ─────────────────────────
 * Redondear siempre hacia abajo convierte el «no tengo cambio» en una comisión
 * silenciosa de veinte centavos por ticket, y a 220 tickets al día son $44
 * diarios que el cliente no aceptó. Redondear siempre hacia arriba regala la
 * misma cifra. Quien decide es el mostrador, en voz alta, y aquí sólo se calcula
 * la opción que se pidió.
 */
export function redondearCambio(
  cambioCentavos: bigint,
  monedaMinimaCentavos: bigint,
  haciaElCliente: boolean,
): CambioRedondeado {
  if (cambioCentavos < 0n) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Un cambio negativo no es un cambio: es un cobro incompleto.',
      { cambioCentavos: cambioCentavos.toString() },
    );
  }
  if (monedaMinimaCentavos <= 0n) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'La moneda más chica del cajón tiene que valer algo.',
      { monedaMinimaCentavos: monedaMinimaCentavos.toString() },
    );
  }

  const sobrante = cambioCentavos % monedaMinimaCentavos;
  if (sobrante === 0n) {
    // El cambio cabe exacto: no hay nada que redondear. Devolver un tipo aquí
    // haría que el corte llevara un renglón de cero por cada venta que cuadra.
    return { entregadoCentavos: cambioCentavos, residuoCentavos: 0n, tipo: null };
  }

  if (haciaElCliente) {
    // Se entrega la moneda completa: el negocio pone la diferencia.
    const entregado = cambioCentavos - sobrante + monedaMinimaCentavos;
    return {
      entregadoCentavos: entregado,
      residuoCentavos: -(entregado - cambioCentavos),
      tipo: 'en_contra',
    };
  }

  return {
    entregadoCentavos: cambioCentavos - sobrante,
    residuoCentavos: sobrante,
    tipo: 'a_favor',
  };
}

/**
 * ¿Este importe cabe en un redondeo?
 *
 * Existe aparte del cálculo porque el redondeo en especie no sale de ahí —el
 * chicle lo elige la persona— y también tiene que pasar por el tope. Sin esta
 * comprobación, «redondear» sería el nombre de un descuento de cualquier tamaño
 * que nadie autoriza.
 */
export function dentroDelTope(importeCentavos: bigint): boolean {
  const magnitud = importeCentavos < 0n ? -importeCentavos : importeCentavos;
  return magnitud >= 1n && magnitud <= TOPE_REDONDEO_CENTAVOS;
}
