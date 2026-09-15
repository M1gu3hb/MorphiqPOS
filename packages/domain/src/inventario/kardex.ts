import { deEscalaCompleta, enEscalaCompleta } from './escala.ts';

/**
 * F-103 · El kardex, que es la única forma de contestar «¿por qué cambió esto?».
 *
 * ── Lo que un kardex tiene que responder ───────────────────────────────────
 * No «cuánto hay» —eso lo dice la existencia— sino **cómo se llegó ahí**. Entró
 * tanto, salió tanto, y cada renglón dice por qué. Sin él, una diferencia de
 * conteo es un número sin historia y la conversación termina en «alguien se lo
 * llevó», que no es una conclusión sino una acusación.
 *
 * ── Por qué el saldo corrido lo calcula Postgres y no esto ─────────────────
 * Una ferretería con 6 000 claves y dos años de movimientos tiene cientos de
 * miles de renglones. Traerlos todos a JavaScript para sumarlos es exactamente
 * el problema que el índice y la función de ventana de la 060 existen para
 * evitar: una ficha que tarda no se consulta, y un dato que no se consulta no
 * sirve. Aquí llegan los renglones YA con su saldo; lo que se hace es el
 * resumen, que es lo que la pantalla enseña arriba y lo que si no se escribiría
 * tres veces en tres `select` distintos.
 */

/** Un renglón del kardex tal como sale de la vista. Todo firmado. */
export interface RenglonKardex {
  readonly movimientoId: string;
  readonly tipo: string;
  readonly motivo: string | null;
  /** Firmada: negativa en las salidas. Texto, nunca `number`. */
  readonly cantidad: string;
  /** La suma corrida hasta este renglón, tal como la devuelve la vista. */
  readonly saldo: string;
  /** El costo del renglón, firmado igual que la cantidad. */
  readonly importeCentavos: bigint;
  readonly cuando: Date;
}

export interface ResumenKardex {
  readonly renglones: number;
  /** Lo que entró, en positivo. */
  readonly entradas: string;
  /** Lo que salió, EN POSITIVO: «12.5000» se lee mejor que «-12.5000». */
  readonly salidas: string;
  /** El saldo del ÚLTIMO renglón, no una suma: el último ya es la suma. */
  readonly saldoFinal: string;
  /** El valor del saldo final, al costo del último movimiento que tenga costo. */
  readonly valorFinalCentavos: bigint;
  /** Cuántos renglones llevan motivo escrito. Es lo que dispara una revisión. */
  readonly conMotivo: number;
}

/**
 * Resume una página de kardex.
 *
 * `renglones` tiene que venir en orden cronológico ASCENDENTE, que es como lo
 * devuelve la vista. El saldo corrido sólo significa algo en ese orden: al
 * revés, el «saldo final» sería en realidad el inicial.
 */
export function resumirKardex(renglones: readonly RenglonKardex[]): ResumenKardex {
  const vacio: ResumenKardex = {
    renglones: 0,
    entradas: enEscalaCompleta(0n),
    salidas: enEscalaCompleta(0n),
    saldoFinal: enEscalaCompleta(0n),
    valorFinalCentavos: 0n,
    conMotivo: 0,
  };
  const ultimo = renglones[renglones.length - 1];
  if (ultimo === undefined) return vacio;

  let entradas = 0n;
  let salidas = 0n;
  let conMotivo = 0;

  for (const renglon of renglones) {
    const cantidad = deEscalaCompleta(renglon.cantidad);
    if (cantidad > 0n) entradas += cantidad;
    else salidas -= cantidad;
    if (renglon.motivo !== null && renglon.motivo.trim() !== '') conMotivo += 1;
  }

  const saldoFinal = deEscalaCompleta(ultimo.saldo);

  return {
    renglones: renglones.length,
    entradas: enEscalaCompleta(entradas),
    salidas: enEscalaCompleta(salidas),
    saldoFinal: enEscalaCompleta(saldoFinal),
    valorFinalCentavos: valorDe(saldoFinal, costoVigente(renglones)),
    conMotivo,
  };
}

/**
 * El último renglón QUE TENGA COSTO, devuelto como la razón `importe/unidades`.
 *
 * ── Por qué una razón y no un costo unitario ya calculado ──────────────────
 * Porque dividir dos veces redondea dos veces. Tres piezas que costaron $1.00
 * dan 33.33 centavos por pieza; guardarlo como `33` y multiplicarlo después por
 * la existencia pierde un centavo por cada tres piezas, y en un abarrote con
 * miles de piezas baratas eso son pesos. Con la razón entera, el único redondeo
 * ocurre al final, sobre el valor total.
 *
 * ── Y por qué se busca hacia atrás ─────────────────────────────────────────
 * Un ajuste de conteo no lleva costo unitario. Valuar el saldo a cero porque el
 * último movimiento fue un ajuste convertiría un almacén lleno en un almacén sin
 * valor — justo el día en que se acaba de contar, que es cuando alguien mira el
 * número.
 */
function costoVigente(renglones: readonly RenglonKardex[]): {
  readonly importeCentavos: bigint;
  readonly unidades: bigint;
} {
  for (let i = renglones.length - 1; i >= 0; i -= 1) {
    const renglon = renglones[i];
    if (renglon === undefined) continue;
    const cantidad = deEscalaCompleta(renglon.cantidad);
    if (cantidad === 0n || renglon.importeCentavos === 0n) continue;
    // `importe = cantidad × costo`, las dos firmadas: el cociente de las dos
    // magnitudes sale positivo tanto en una entrada como en una salida.
    return {
      importeCentavos:
        renglon.importeCentavos < 0n ? -renglon.importeCentavos : renglon.importeCentavos,
      unidades: cantidad < 0n ? -cantidad : cantidad,
    };
  }
  return { importeCentavos: 0n, unidades: 0n };
}

/**
 * `saldo × (importe / unidades)`, con un solo redondeo al final.
 *
 * `saldo` y `unidades` vienen los dos en diezmilésimas, así que la escala se
 * cancela sola en la división y no hay que desandarla a mano — que es donde
 * salen los factores de diez mil de más.
 */
function valorDe(
  saldo: bigint,
  costo: { readonly importeCentavos: bigint; readonly unidades: bigint },
): bigint {
  if (costo.unidades === 0n) return 0n;
  const producto = saldo * costo.importeCentavos;
  const mitad = costo.unidades / 2n;
  // Redondeo al centavo más cercano, simétrico alrededor del cero: un saldo
  // negativo es un dato roto que ya se va a investigar, y no hay que empeorarlo
  // dándole medio centavo de más.
  return producto < 0n
    ? -((-producto + mitad) / costo.unidades)
    : (producto + mitad) / costo.unidades;
}
