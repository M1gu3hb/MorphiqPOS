import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-205 · Cuánto puede descontar cada puesto, y cuándo hay que pedir permiso.
 *
 * ── El agujero que cierra ──────────────────────────────────────────────────
 * Hoy cualquiera que pueda cobrar puede descontar lo que quiera. No hay tope, no
 * hay autorización y no hay rastro: un descuento del 40 % y una venta regalada
 * se ven exactamente igual en el corte, y las dos se ven igual que un cobro
 * normal. Es el camino más corto para que se vaya dinero sin que nadie mienta.
 *
 * ── Los DOS topes, y por qué hacen falta los dos ──────────────────────────
 * En pesos, porque un 10 % sobre un café son tres pesos y sobre una charola de
 * cincuenta son doscientos: un tope porcentual deja pasar el descuento grande y
 * bloquea el chico, que es justo al revés de lo que hace falta.
 *
 * Y en porcentaje, porque con sólo el tope en pesos **un café de $45 se puede
 * regalar entero** sin que nada salte, si el tope del puesto son $50. Los dos
 * juntos cierran los dos extremos, y cualquiera de los dos solo deja uno abierto.
 */

export interface TopeDePuesto {
  readonly topeCentavos: bigint;
  /** En puntos base. 2000 = 20 %. */
  readonly topeBp: number;
}

export interface SolicitudDeDescuento {
  /** El importe de la venta ANTES del descuento. */
  readonly baseCentavos: bigint;
  readonly descuentoCentavos: bigint;
  readonly tope: TopeDePuesto;
}

export type VeredictoDescuento =
  /** Cabe en los dos topes: se aplica sin preguntar nada. */
  | { readonly veredicto: 'libre' }
  /** No cabe: hace falta que alguien con más tope lo autorice. */
  | {
      readonly veredicto: 'requiere_autorizacion';
      /** Cuál de los dos topes se pasó. Es lo que la pantalla tiene que decir. */
      readonly porque: 'importe' | 'porcentaje';
      readonly topeCentavos: bigint;
      readonly topeBp: number;
    };

const CIEN_POR_CIENTO_BP = 10_000;

/**
 * ¿Puede este puesto aplicar este descuento por su cuenta?
 *
 * ── Por qué el importe se comprueba ANTES que el porcentaje ───────────────
 * Porque el mensaje importa. «Tu tope son $50 y esto son $200» se entiende y se
 * arregla pidiendo permiso; «tu tope es el 10 % y esto es el 30 %» obliga a
 * quien cobra a hacer una regla de tres con gente esperando. Cuando los dos se
 * pasan, se nombra el que la persona puede leer de la pantalla.
 */
export function evaluarDescuento(solicitud: SolicitudDeDescuento): VeredictoDescuento {
  const { baseCentavos, descuentoCentavos, tope } = solicitud;

  if (descuentoCentavos <= 0n) {
    throw new ErrorDominio(
      'DINERO_NO_ENTERO',
      'Un descuento de cero o negativo no es un descuento.',
    );
  }
  if (baseCentavos <= 0n) {
    throw new ErrorDominio('ORDEN_VACIA', 'No se puede descontar sobre una venta sin importe.');
  }
  if (descuentoCentavos > baseCentavos) {
    throw new ErrorDominio('DIVISION_NO_CUADRA', 'El descuento no puede ser mayor que la venta.', {
      baseCentavos: baseCentavos.toString(),
      descuentoCentavos: descuentoCentavos.toString(),
    });
  }

  if (descuentoCentavos > tope.topeCentavos) {
    return {
      veredicto: 'requiere_autorizacion',
      porque: 'importe',
      topeCentavos: tope.topeCentavos,
      topeBp: tope.topeBp,
    };
  }

  // ── Por qué se multiplica en cruz en vez de dividir ─────────────────────
  // `descuento / base` en enteros TRUNCA, y truncar aquí es tolerar en
  // silencio: sobre una venta de $300 con tope del 10 %, un descuento de $30.01
  // daría 1000 bp exactos y pasaría. Un centavo no arruina a nadie, pero una
  // tolerancia que nadie declaró sí — y el día que la venta sea de $30 000, el
  // mismo truncamiento tolera un peso.
  //
  // Y no se usa coma flotante porque es dinero: `20.000000000000004` rechazaría
  // un descuento del 20 % exacto contra un tope del 20 %.
  if (descuentoCentavos * BigInt(CIEN_POR_CIENTO_BP) > BigInt(tope.topeBp) * baseCentavos) {
    return {
      veredicto: 'requiere_autorizacion',
      porque: 'porcentaje',
      topeCentavos: tope.topeCentavos,
      topeBp: tope.topeBp,
    };
  }

  return { veredicto: 'libre' };
}

/**
 * ¿Puede ESTE puesto autorizar lo que aquél no podía?
 *
 * ── Por qué no basta con «tiene más tope» ─────────────────────────────────
 * Porque quien autoriza tiene que poder cubrir el descuento ENTERO con su propio
 * tope. Si un gerente con tope de $2 000 autoriza uno de $5 000, lo que hay no
 * es una autorización: es la misma falta de tope, con una firma encima.
 */
export function puedeAutorizar(
  descuentoCentavos: bigint,
  baseCentavos: bigint,
  topeDeQuienAutoriza: TopeDePuesto,
): boolean {
  if (descuentoCentavos > topeDeQuienAutoriza.topeCentavos) return false;
  if (baseCentavos <= 0n) return false;
  // En cruz, por la misma razón que arriba: dividir trunca y tolerar en
  // silencio es justo lo que un tope no puede hacer.
  return (
    descuentoCentavos * BigInt(CIEN_POR_CIENTO_BP) <=
    BigInt(topeDeQuienAutoriza.topeBp) * baseCentavos
  );
}
