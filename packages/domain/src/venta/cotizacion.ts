/**
 * F-600, F-601, F-605 y F-607 · La aritmética de una cotización.
 *
 * ── Qué vive aquí y qué no ───────────────────────────────────────────────
 * Aquí están las tres cuentas que no necesitan base de datos: si una cotización
 * sigue viva, cuánto falta por surtir, y cómo se lee un embudo de cotizaciones
 * cerradas. Todo lo que toca filas —crear, versionar, convertir— vive en
 * `packages/app`, porque necesita transacción.
 *
 * Separarlas no es ceremonia: estas tres son las que se prueban con números
 * concretos y sin montar nada, y son justo las que un error vuelve invisible —
 * una vigencia mal calculada no falla, honra un precio viejo—.
 */

/** Una línea, vista por la aritmética: cuánto se pidió y cuánto se ha dado. */
export interface LineaCotizada {
  readonly id: string;
  /** En unidad base, con cuatro decimales, como texto. Nunca `number`. */
  readonly cantidad: string;
  readonly surtida: string;
  readonly totalCentavos: bigint;
}

export interface SaldoDeSurtido {
  readonly completa: boolean;
  readonly lineasPendientes: number;
  /** Lo que todavía no sale del almacén, en centavos y a prorrata. */
  readonly pendienteCentavos: bigint;
}

export type EstadoCotizacion =
  'borrador' | 'enviada' | 'aprobada' | 'ganada' | 'perdida' | 'vencida';

/** Las cuatro decimales de `numeric(14,4)`, sin pasar nunca por coma flotante. */
const ESCALA = 10_000n;

function aEscala(valor: string): bigint {
  const limpio = valor.trim();
  if (!/^\d{1,14}(\.\d{1,4})?$/.test(limpio)) {
    throw new Error(`Cantidad con forma inválida: «${valor}». Hasta cuatro decimales.`);
  }
  const [entero = '0', decimal = ''] = limpio.split('.');
  return BigInt(entero) * ESCALA + BigInt(decimal.padEnd(4, '0'));
}

/**
 * F-600 · ¿Sigue viva esta cotización?
 *
 * La comparación es por DÍA y no por instante: `vence_el` es una fecha, y una
 * cotización que vence «el 30» se honra todo el 30. Compararla contra `now()`
 * la mataría a las 00:00:01 de ese día, y el cliente que llega a mediodía con
 * el papel en la mano tendría razón en enfadarse.
 */
export function sigueVigente(venceEl: string, hoy: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venceEl)) {
    throw new Error(`«${venceEl}» no es una fecha ISO de día.`);
  }
  const dia = hoy.toISOString().slice(0, 10);
  return venceEl >= dia;
}

/**
 * F-601 · El número de la versión siguiente.
 *
 * Trivial a propósito: lo que importa no es el `+ 1`, es que exista un solo
 * sitio que lo decida. Cuando cada comando lo calcula por su cuenta, dos
 * versiones acaban con el mismo número el día que alguien duplica un documento.
 */
export function versionSiguiente(actual: number): number {
  if (!Number.isInteger(actual) || actual < 1) {
    throw new Error('La versión de una cotización es un entero de uno para arriba.');
  }
  return actual + 1;
}

/**
 * F-605 · Cuánto falta por surtir.
 *
 * El importe pendiente se reparte A PRORRATA de lo que falta de cada línea, y
 * no se recalcula multiplicando precio por cantidad: el total de la línea ya
 * incluye su descuento, y rehacer la multiplicación aquí daría un número
 * distinto del que el cliente aprobó.
 */
export function saldoDeSurtido(lineas: readonly LineaCotizada[]): SaldoDeSurtido {
  let pendienteCentavos = 0n;
  let lineasPendientes = 0;

  for (const linea of lineas) {
    const pedida = aEscala(linea.cantidad);
    const dada = aEscala(linea.surtida);
    if (dada > pedida) {
      throw new Error(`La línea ${linea.id} tiene más surtido que pedido.`);
    }
    if (dada === pedida) continue;

    lineasPendientes += 1;
    // A prorrata sobre el total YA calculado de la línea. El redondeo cae
    // siempre del mismo lado —hacia abajo— para que la suma de los pendientes
    // nunca pase del total del documento.
    pendienteCentavos += (linea.totalCentavos * (pedida - dada)) / pedida;
  }

  return { completa: lineasPendientes === 0, lineasPendientes, pendienteCentavos };
}

export interface Embudo {
  readonly cotizadas: number;
  readonly ganadas: number;
  readonly perdidas: number;
  /** En puntos base, para no meter decimales. 4 200 = 42 %. */
  readonly tasaDeCierreBp: number;
  readonly montoGanadoCentavos: bigint;
  readonly montoPerdidoCentavos: bigint;
}

/**
 * F-607 · El embudo, que es lo único que este bloque tiene que producir.
 *
 * ── Por qué las abiertas NO entran en la tasa ────────────────────────────
 * Una cotización que todavía está en juego no es una perdida. Meterla en el
 * denominador hace que la tasa de cierre baje cada vez que se cotiza más, que
 * es exactamente al revés de lo que el número debería decir: un mes con veinte
 * cotizaciones abiertas parecería peor que uno con dos.
 */
export function embudo(
  documentos: readonly { readonly estado: EstadoCotizacion; readonly totalCentavos: bigint }[],
): Embudo {
  let ganadas = 0;
  let perdidas = 0;
  let montoGanadoCentavos = 0n;
  let montoPerdidoCentavos = 0n;

  for (const d of documentos) {
    if (d.estado === 'ganada') {
      ganadas += 1;
      montoGanadoCentavos += d.totalCentavos;
    }
    // `vencida` cuenta como perdida: el cliente no dijo que no, pero el negocio
    // tampoco la ganó, y esconderla haría que la tasa de cierre subiera cada
    // vez que se deja morir una cotización sin seguimiento.
    if (d.estado === 'perdida' || d.estado === 'vencida') {
      perdidas += 1;
      montoPerdidoCentavos += d.totalCentavos;
    }
  }

  const cerradas = ganadas + perdidas;
  return {
    cotizadas: documentos.length,
    ganadas,
    perdidas,
    tasaDeCierreBp: cerradas === 0 ? 0 : Math.round((ganadas * 10_000) / cerradas),
    montoGanadoCentavos,
    montoPerdidoCentavos,
  };
}
