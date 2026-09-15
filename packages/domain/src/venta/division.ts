import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-321 · Dividir una cuenta, sin perder ni inventar un centavo.
 *
 * ── El dolor que cierra ────────────────────────────────────────────────────
 * La mesa de ocho pide cuentas separadas y hoy el cajero las calcula a mano en
 * el teléfono: de 5 a 12 minutos con gente esperando mesa detrás. Es el hueco
 * más caro de los ocho que le quedan al modelo, y donde más descuadres nacen.
 *
 * ── La única regla que importa ─────────────────────────────────────────────
 * **La suma de las hijas iguala a la madre, exactamente.** Dividir una cuenta y
 * perder $40 en el camino no puede ser posible. Aquí se garantiza en aritmética
 * de enteros, y la base lo vuelve a comprobar con un trigger diferido — dos
 * cerrojos, porque éste es dinero que ya está en la mesa.
 *
 * ── Por qué es dominio puro ────────────────────────────────────────────────
 * Entra la cuenta, salen las particiones. Sin base, sin transacción y sin
 * pantalla, así que se puede probar con cien casos en un segundo. Quien cobra
 * ejecuta el resultado.
 */

/** Una línea de la cuenta madre, con su importe YA calculado por el servidor. */
export interface LineaDivisible {
  readonly lineaId: string;
  /** Cantidad total de la línea, en unidades enteras. */
  readonly cantidad: number;
  /** Importe total de la línea en centavos. Lo calculó el servidor, no el cliente. */
  readonly importeCentavos: bigint;
}

/** Lo que una partición se lleva de una línea. */
export interface TomaDeLinea {
  readonly lineaId: string;
  /** Cuántas unidades de esa línea. Puede ser menos que el total. */
  readonly cantidad: number;
}

export interface ParticionPedida {
  readonly tomas: readonly TomaDeLinea[];
}

export interface ParticionCalculada {
  readonly indice: number;
  readonly tomas: readonly TomaDeLinea[];
  readonly totalCentavos: bigint;
}

export interface DivisionCalculada {
  readonly particiones: readonly ParticionCalculada[];
  readonly totalCentavos: bigint;
}

/**
 * Reparte el importe de UNA línea entre las unidades que se lleva cada
 * partición, por el método del residuo mayor.
 *
 * El caso real: una botella de vino de $437 entre 3 personas. 437 / 3 no da
 * entero, y las dos salidas fáciles están mal — redondear a 145 deja 2 centavos
 * sin cobrar, redondear a 146 cobra 1 que nadie puso. Los primeros de la lista
 * se llevan el centavo de más, en orden determinista, para que el reparto se
 * pueda cuadrar contra el corte.
 */
function repartirLinea(importe: bigint, unidades: readonly number[]): bigint[] {
  const total = unidades.reduce((a, b) => a + b, 0);
  if (total === 0) return unidades.map(() => 0n);

  const totalGrande = BigInt(total);
  const base = unidades.map((u) => (importe * BigInt(u)) / totalGrande);
  let repartido = base.reduce((a, b) => a + b, 0n);

  // El residuo se reparte de uno en uno, en orden, y se aleja del cero para que
  // dividir X y dividir -X sean espejo exacto.
  //
  // El tope de UNA vuelta no es decorativo. El residuo de una división truncada
  // es siempre menor que el número de partes, así que una vuelta basta; y sin
  // el tope, un `paso` con el signo equivocado deja este bucle girando para
  // siempre dentro de una petición. Un servidor colgado es peor que un error:
  // lo comprobé mutando el signo y la suite se quedaba sin terminar, en vez de
  // fallar.
  const paso = importe < 0n ? -1n : 1n;
  const salida = [...base];
  for (let i = 0; repartido !== importe; i += 1) {
    if (i >= salida.length) {
      throw new ErrorDominio(
        'DIVISION_NO_CUADRA',
        `Al repartir la línea sobraron ${importe - repartido} centavos.`,
      );
    }
    salida[i] = (salida[i] ?? 0n) + paso;
    repartido += paso;
  }
  return salida;
}

/**
 * Calcula la división. Falla en vez de silenciar.
 *
 * Lo que rechaza, y por qué cada cosa:
 *   · menos de dos particiones — dividir en una no es dividir;
 *   · una línea que no existe en la madre — cobrar algo que nadie pidió;
 *   · más unidades de las que hay — cobrar dos veces el mismo platillo;
 *   · unidades sin repartir — dejar consumo sin cobrar, que es el defecto que
 *     el cajero comete hoy a mano y la razón de que esto exista.
 */
export function calcularDivision(
  lineas: readonly LineaDivisible[],
  pedidas: readonly ParticionPedida[],
): DivisionCalculada {
  if (pedidas.length < 2) {
    throw new ErrorDominio('DIVISION_NO_CUADRA', 'Una cuenta se divide en dos partes o más.');
  }

  const porId = new Map(lineas.map((l) => [l.lineaId, l]));
  /** Cuántas unidades de cada línea se lleva cada partición. */
  const tomadas = new Map<string, number[]>();

  for (const [indice, particion] of pedidas.entries()) {
    if (particion.tomas.length === 0) {
      throw new ErrorDominio('DIVISION_NO_CUADRA', `La parte ${indice + 1} quedó vacía.`);
    }
    for (const toma of particion.tomas) {
      const linea = porId.get(toma.lineaId);
      if (linea === undefined) {
        throw new ErrorDominio(
          'DIVISION_NO_CUADRA',
          'Esa línea no pertenece a la cuenta que se está dividiendo.',
        );
      }
      if (!Number.isInteger(toma.cantidad) || toma.cantidad <= 0) {
        throw new ErrorDominio('DIVISION_NO_CUADRA', 'Cada parte se lleva al menos una unidad.');
      }
      const acumulado = tomadas.get(toma.lineaId) ?? pedidas.map(() => 0);
      acumulado[indice] = (acumulado[indice] ?? 0) + toma.cantidad;
      tomadas.set(toma.lineaId, acumulado);
    }
  }

  // TODA unidad de la madre tiene que quedar en alguna parte. Si sobra una, ese
  // platillo no se cobra; si falta, se cobra dos veces.
  for (const linea of lineas) {
    const repartidas = (tomadas.get(linea.lineaId) ?? []).reduce((a, b) => a + b, 0);
    if (repartidas !== linea.cantidad) {
      throw new ErrorDominio(
        'DIVISION_NO_CUADRA',
        `Quedaron ${linea.cantidad - repartidas} unidad(es) sin repartir en la cuenta.`,
        { lineaId: linea.lineaId },
      );
    }
  }

  const totales = pedidas.map(() => 0n);
  for (const [lineaId, unidades] of tomadas) {
    const linea = porId.get(lineaId);
    if (linea === undefined) continue;
    const trozos = repartirLinea(linea.importeCentavos, unidades);
    for (const [i, trozo] of trozos.entries()) {
      totales[i] = (totales[i] ?? 0n) + trozo;
    }
  }

  const particiones = pedidas.map((p, i) => ({
    indice: i + 1,
    tomas: p.tomas,
    totalCentavos: totales[i] ?? 0n,
  }));

  const suma = particiones.reduce((a, p) => a + p.totalCentavos, 0n);
  const madre = lineas.reduce((a, l) => a + l.importeCentavos, 0n);

  // SEGUNDO CERROJO, y hay que decir lo que es: **hoy no se puede disparar.**
  // El método del residuo de `repartirLinea` ya garantiza que cada línea se
  // reparta completa, así que quitarlo no rompe ninguna prueba — lo comprobé
  // mutándolo. Se conserva igual, por dos razones concretas:
  //
  //   1. El día que alguien «optimice» `repartirLinea` con una división
  //      flotante, esto lo caza ANTES de escribir nada en la base.
  //   2. Es la misma afirmación que el trigger diferido de la 070, escrita en
  //      el idioma del dominio. Que la base la repita no la hace redundante:
  //      la hace comprobable sin Postgres.
  //
  // No se presenta como una guarda activa porque no lo es. Un comentario que
  // dijera «esto protege X» sobre algo inalcanzable es peor que no tenerlo.
  if (suma !== madre) {
    throw new ErrorDominio(
      'DIVISION_NO_CUADRA',
      `La división no cuadra: la madre suma ${madre} y las partes ${suma}.`,
    );
  }

  return { particiones, totalCentavos: madre };
}
