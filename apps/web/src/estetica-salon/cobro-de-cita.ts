/**
 * Las cuentas de la pantalla de cobro del salón que NO son dinero del servidor.
 *
 * El total, el IVA, el anticipo y el descuento los calcula el servidor (`venta.cotizar_cita`)
 * y la pantalla sólo los enseña. Lo que vive aquí es lo que la persona decide en el
 * mostrador y el servidor comprueba después: cómo se reparte el pago entre métodos,
 * por qué camino entra la propina y para quién es, y qué hace cada tecla.
 *
 * Sin React y sin red, para que cada regla tenga su prueba (`cobro-de-cita.test.ts`).
 */

export type Metodo = 'efectivo' | 'tarjeta' | 'transferencia';

/** Los tres caminos de una propina en el salón (`02-DINERO-Y-CAJA §4.2`). */
export type Camino = 'mano' | 'cajon' | 'terminal';

export interface RenglonDePago {
  readonly metodo: Metodo;
  /** `null` mientras el campo está vacío o no es un importe. */
  readonly centavos: number | null;
}

export interface PagoEnviado {
  readonly metodo: Metodo;
  readonly montoCentavos: number;
  readonly aCuentaDe?: string;
  readonly porConfirmar?: boolean;
}

export interface PropinaEnviada {
  readonly profesionalId: string;
  readonly montoCentavos: number;
  readonly camino: Camino;
}

/** A dónde cayó una transferencia: la cuenta del salón o la de una profesional. */
export interface CuentaDeTransferencia {
  /** `null` es la cuenta del salón. */
  readonly profesionalId: string | null;
  readonly porConfirmar: boolean;
}

/**
 * Reparte `total` en proporción a `pesos`, al centavo EXACTO.
 *
 * Cada parte recibe su porción entera y los centavos que sobran van a las de mayor
 * residuo, las primeras si empatan. Es la propina «repartida en la proporción del
 * servicio» (`04-INTERFAZ §4.3.4`, decisión 3): la suma tiene que dar la propina,
 * no un centavo más ni uno menos.
 */
export function repartirProporcional(total: number, pesos: readonly number[]): readonly number[] {
  const suma = pesos.reduce((a, p) => a + p, 0);
  if (total <= 0 || suma <= 0) return pesos.map(() => 0);
  // Enteros y no una división en coma flotante: `total × peso` cabe de sobra en un
  // entero exacto de JavaScript con propinas y servicios reales, y el residuo entero
  // no empata por un error de redondeo donde no hay empate.
  const partes = pesos.map((peso, indice) => ({
    indice,
    entera: Math.floor((total * peso) / suma),
    residuo: (total * peso) % suma,
  }));
  let sobran = total - partes.reduce((a, p) => a + p.entera, 0);
  const porResiduo = partes.toSorted((a, b) =>
    a.residuo === b.residuo ? a.indice - b.indice : b.residuo - a.residuo,
  );
  const extra = new Set<number>();
  for (const parte of porResiduo) {
    if (sobran <= 0) break;
    extra.add(parte.indice);
    sobran -= 1;
  }
  return partes.map((p) => p.entera + (extra.has(p.indice) ? 1 : 0));
}

/** Cuánto FALTA en un pago mixto: positivo si falta, negativo si sobra, 0 si cuadra. */
export function faltaEnMixto(porCobrar: number, renglones: readonly RenglonDePago[]): number {
  return porCobrar - renglones.reduce((a, r) => a + (r.centavos ?? 0), 0);
}

/**
 * Los pagos que viajan al servidor.
 *
 * Con UN método, un renglón por lo que queda por cobrar. En MIXTO, los renglones con
 * importe, en su orden. Si el anticipo cubre la cita entera no viaja ninguno: no hay
 * nada que cobrar hoy. La cuenta de la transferencia va en su renglón.
 */
export function pagosParaEnviar(
  modo: 'uno' | 'mixto',
  metodo: Metodo | null,
  renglones: readonly RenglonDePago[],
  porCobrar: number,
  cuenta: CuentaDeTransferencia,
): readonly PagoEnviado[] {
  if (porCobrar <= 0) return [];
  const conCuenta = (pago: PagoEnviado): PagoEnviado =>
    pago.metodo !== 'transferencia'
      ? pago
      : {
          ...pago,
          ...(cuenta.profesionalId === null ? {} : { aCuentaDe: cuenta.profesionalId }),
          ...(cuenta.porConfirmar ? { porConfirmar: true } : {}),
        };
  if (modo === 'uno') {
    return metodo === null ? [] : [conCuenta({ metodo, montoCentavos: porCobrar })];
  }
  return renglones
    .filter((r) => r.centavos !== null && r.centavos > 0)
    .map((r) => conCuenta({ metodo: r.metodo, montoCentavos: r.centavos ?? 0 }));
}

/** Los caminos que admite la propina con estos métodos: el servidor exige lo mismo. */
export function caminosPosibles(metodos: readonly Metodo[]): readonly Camino[] {
  return [
    'mano',
    ...(metodos.includes('efectivo') ? (['cajon'] as const) : []),
    ...(metodos.includes('tarjeta') ? (['terminal'] as const) : []),
  ];
}

/**
 * El camino por omisión: en la terminal si se paga con tarjeta —es donde la terminal
 * ofrece 12, 15 y 18 %—, y a la mano si no, que es «la mayoría» (§4.2).
 */
export function caminoPorOmision(metodos: readonly Metodo[]): Camino {
  return metodos.includes('tarjeta') ? 'terminal' : 'mano';
}

export interface ParteDelEquipo {
  readonly profesionalId: string;
  /** Lo que suma su servicio en esta cita: el peso de su parte de la propina. */
  readonly centavos: number;
}

export interface PropinaDelMostrador {
  readonly centavos: number;
  /** `'repartir'` o el id de UNA profesional. */
  readonly destinatario: string;
  readonly camino: Camino;
  readonly equipo: readonly ParteDelEquipo[];
  /** La de apoyo: «$50 para la que me lavó». Otro importe, otra persona. */
  readonly apoyo: { readonly profesionalId: string; readonly centavos: number } | null;
}

/**
 * Las propinas que viajan al servidor, cada una con su destinataria.
 *
 * «Repartir» parte la principal en la proporción del servicio de cada quien; con una
 * sola persona en la cita, es toda suya. La de apoyo va aparte y por el mismo camino.
 * Lo que da cero no viaja: una fila de propina de cero pesos es un renglón que la
 * estilista tendría que leer para descubrir que no dice nada.
 */
export function propinasParaEnviar(propina: PropinaDelMostrador): readonly PropinaEnviada[] {
  const principal: PropinaEnviada[] =
    propina.destinatario === 'repartir'
      ? repartirProporcional(
          propina.centavos,
          propina.equipo.map((p) => p.centavos),
        ).flatMap((monto, indice) => {
          const quien = propina.equipo[indice];
          return quien === undefined
            ? []
            : [
                {
                  profesionalId: quien.profesionalId,
                  montoCentavos: monto,
                  camino: propina.camino,
                },
              ];
        })
      : [
          {
            profesionalId: propina.destinatario,
            montoCentavos: propina.centavos,
            camino: propina.camino,
          },
        ];
  const apoyo: PropinaEnviada[] =
    propina.apoyo === null
      ? []
      : [
          {
            profesionalId: propina.apoyo.profesionalId,
            montoCentavos: propina.apoyo.centavos,
            camino: propina.camino,
          },
        ];
  return [...principal, ...apoyo].filter((p) => p.montoCentavos > 0);
}

/** Lo que la propina suma al cobro del SALÓN: la de la mano no pasa por aquí. */
export function propinaQueCobraElSalon(propinas: readonly PropinaEnviada[]): number {
  return propinas.filter((p) => p.camino !== 'mano').reduce((a, p) => a + p.montoCentavos, 0);
}

export type AccionDeTecla =
  'cobrar' | 'efectivo' | 'tarjeta' | 'transferencia' | 'propina' | 'cancelar';

/** Los atajos de PC del documento: F12 cobrar · F2/F3/F4 métodos · F7 propina · ESC. */
export function accionDeTecla(tecla: string): AccionDeTecla | null {
  const mapa: Readonly<Record<string, AccionDeTecla>> = {
    F12: 'cobrar',
    F2: 'efectivo',
    F3: 'tarjeta',
    F4: 'transferencia',
    F7: 'propina',
    Escape: 'cancelar',
  };
  return mapa[tecla] ?? null;
}
