/**
 * El desglose de propinas por método de pago, EXACTO (F1-01 §3.3).
 *
 * Es la regla que más se rompe y la que este archivo existe para cerrar: si el
 * comensal dejó 50 en efectivo y 30 en tarjeta, son 50 y 30. Nunca un reparto
 * proporcional sobre lo que costó la comida, que daría otro número y descuadraría
 * el cajón por la diferencia.
 *
 * Deja de hacer falta el respaldo de `desgloseMetodosPagoExacto`
 * (`tipsUtils.js:92-155`), 45 líneas para adivinar el método de una venta vieja:
 * en el esquema nuevo cada fila de `pagos` lleva su `metodo` **y** su
 * `propina_centavos`, así que el desglose es una suma por grupo y no hay ninguna
 * venta sin desglose que reconstruir (F1-04 §6.1).
 *
 * Todo en `bigint` de centavos. Aquí no entra un `number`: `Math.round(x * 100)`
 * pierde el medio centavo justo en el caso que importa (R15).
 */

/** Los tres métodos que el restaurante usa. `pagos.metodo` admite tres más. */
export const METODOS_DE_PROPINA = ['efectivo', 'tarjeta', 'transferencia'] as const;

export type MetodoDePropina = (typeof METODOS_DE_PROPINA)[number];

/** Una fila de `pagos`, o un `group by metodo` sobre varias. */
export interface RenglonDePago {
  readonly metodo: string;
  /** La VENTA cobrada por ese método. Nunca incluye la propina (regla 1). */
  readonly montoCentavos: bigint;
  readonly propinaCentavos: bigint;
}

export interface TotalesDeMetodo {
  readonly ventasCentavos: bigint;
  readonly propinasCentavos: bigint;
  /** Lo que entró FÍSICAMENTE por ese método: venta más propina. */
  readonly recibidoCentavos: bigint;
}

export interface DesgloseExacto {
  readonly efectivo: TotalesDeMetodo;
  readonly tarjeta: TotalesDeMetodo;
  readonly transferencia: TotalesDeMetodo;
  /**
   * `fiado`, `puntos` y `monedero`, que el `check` de `pagos` admite.
   *
   * Se agrupan aparte en vez de descartarse: una propina en un método que esta
   * pantalla no dibuja seguiría siendo dinero de alguien, y sumarla al efectivo
   * «para que cuadre» es exactamente cómo se pierde la pista.
   */
  readonly otros: TotalesDeMetodo;
  readonly ventasCentavos: bigint;
  readonly propinasCentavos: bigint;
}

const VACIO: TotalesDeMetodo = {
  ventasCentavos: 0n,
  propinasCentavos: 0n,
  recibidoCentavos: 0n,
};

/**
 * Suma los renglones por método, sin repartir nada.
 *
 * No hay una sola división en esta función, y ese es el punto: un reparto
 * proporcional necesita dividir, y donde hay división hay redondeo, y donde hay
 * redondeo la suma de las partes deja de ser el total.
 */
export function desglosarPagos(renglones: readonly RenglonDePago[]): DesgloseExacto {
  const cubos = new Map<string, TotalesDeMetodo>();
  let ventasCentavos = 0n;
  let propinasCentavos = 0n;

  for (const renglon of renglones) {
    const clave = esMetodoDePropina(renglon.metodo) ? renglon.metodo : 'otros';
    const previo = cubos.get(clave) ?? VACIO;
    cubos.set(clave, {
      ventasCentavos: previo.ventasCentavos + renglon.montoCentavos,
      propinasCentavos: previo.propinasCentavos + renglon.propinaCentavos,
      recibidoCentavos: previo.recibidoCentavos + renglon.montoCentavos + renglon.propinaCentavos,
    });
    ventasCentavos += renglon.montoCentavos;
    propinasCentavos += renglon.propinaCentavos;
  }

  return {
    efectivo: cubos.get('efectivo') ?? VACIO,
    tarjeta: cubos.get('tarjeta') ?? VACIO,
    transferencia: cubos.get('transferencia') ?? VACIO,
    otros: cubos.get('otros') ?? VACIO,
    ventasCentavos,
    propinasCentavos,
  };
}

/**
 * Lo que debe haber en el cajón por estas ventas: efectivo de venta MÁS propina
 * en efectivo (regla 4 de `F1-01` §3).
 *
 * La propina en efectivo está físicamente ahí. El cajero la va a contar quiera o
 * no, así que el esperado tiene que incluirla o el corte marca un sobrante que
 * nadie sabe explicar. Las de tarjeta y transferencia no mueven el cajón.
 */
export function efectivoDelCajon(desglose: DesgloseExacto): bigint {
  return desglose.efectivo.recibidoCentavos;
}

/**
 * Etiqueta de las ventas sin mesero. La misma de `Caja.jsx:163`.
 *
 * `agruparPropinasPorMesero` (`tipsUtils.js:57-63`) usa otra —«Sin mesero /
 * venta directa»— para el mismo caso, y las dos acaban en pantallas distintas.
 * Se elige la del corte, que es la que se imprime en el ticket
 * (`CorteTicket.jsx:211-212`) y por tanto la que Miguel ve en papel.
 */
export const SIN_MESERO = 'Caja / venta directa';

/** Una venta que va a la mesa de alguien, sin nombre cuando fue venta directa. */
export function etiquetaDeMesero(nombre: string | null): string {
  const limpio = nombre?.trim() ?? '';
  return limpio === '' ? SIN_MESERO : limpio;
}

export interface PropinaDeMesero {
  readonly meseroId: string | null;
  readonly meseroNombre: string;
  readonly propinaCentavos: string;
  readonly numeroVentas: number;
}

function esMetodoDePropina(valor: string): valor is MetodoDePropina {
  return (METODOS_DE_PROPINA as readonly string[]).includes(valor);
}

/** Los totales de un método, ya en texto, para cruzar la frontera HTTP. */
export interface MetodoServible {
  readonly ventasCentavos: string;
  readonly propinasCentavos: string;
  readonly recibidoCentavos: string;
}

export interface DesgloseServible {
  readonly efectivo: MetodoServible;
  readonly tarjeta: MetodoServible;
  readonly transferencia: MetodoServible;
  readonly otros: MetodoServible;
  readonly ventasCentavos: string;
  readonly propinasCentavos: string;
  /** Regla 4: el efectivo del cajón SÍ lleva la propina en efectivo. */
  readonly efectivoDelCajonCentavos: string;
}

/** `bigint` no se serializa a JSON: viaja como texto, igual que en el cobro. */
export function servirDesglose(desglose: DesgloseExacto): DesgloseServible {
  return {
    efectivo: servirMetodo(desglose.efectivo),
    tarjeta: servirMetodo(desglose.tarjeta),
    transferencia: servirMetodo(desglose.transferencia),
    otros: servirMetodo(desglose.otros),
    ventasCentavos: desglose.ventasCentavos.toString(),
    propinasCentavos: desglose.propinasCentavos.toString(),
    efectivoDelCajonCentavos: efectivoDelCajon(desglose).toString(),
  };
}

function servirMetodo(totales: TotalesDeMetodo): MetodoServible {
  return {
    ventasCentavos: totales.ventasCentavos.toString(),
    propinasCentavos: totales.propinasCentavos.toString(),
    recibidoCentavos: totales.recibidoCentavos.toString(),
  };
}
