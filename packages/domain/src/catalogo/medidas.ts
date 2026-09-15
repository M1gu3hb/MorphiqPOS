import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-059 · La medida técnica, normalizada. El eje del catálogo de ferretería.
 *
 * ── Por qué sin esto no hay modelo ────────────────────────────────────────
 * Un producto de ferretería **no tiene nombre útil**: tiene una combinación de
 * atributos. `Tornillo · tirafondo · 1/4" · 2" · galvanizado · hexagonal`. Hoy
 * la búsqueda es por nombre y «tornillo» devuelve 340 resultados sin orden, así
 * que el mostradorista no usa el sistema: usa su memoria. Y en ese momento el
 * inventario, el margen y los faltantes se vuelven ficción, porque lo que se
 * vendió no es lo que se tecleó.
 *
 * ── Por qué MICRÓMETROS ───────────────────────────────────────────────────
 * Porque `1/4"` son 6.35 mm exactos y `1/8"` son 3.175 mm. En milímetros
 * enteros se pierde; en milímetros con decimales vuelven los flotantes que esta
 * fase prohíbe. En micrómetros, `1/4"` es **6350** y `1/8"` es **3175**, los dos
 * enteros. Es la misma decisión que los centavos y los gramos, llevada a la
 * longitud.
 *
 * ── `1/4"`, `.25` y `6.35 mm` son el mismo dato y tres escrituras ─────────
 * El distribuidor manda una, el mostradorista teclea otra y la etiqueta dice la
 * tercera. Si el sistema no las une, el mismo tornillo vive tres veces en el
 * catálogo — y con la clave duplicada el conteo no cuadra nunca, que es el
 * error de inventario número uno documentado del giro.
 *
 * ── Lo que aquí NO se hace ───────────────────────────────────────────────
 * No se reconstruye la fracción desde el normalizado. `6350` podría presentarse
 * como `1/4"` o como `6.35 mm`, y la correcta es **la que se capturó**: por eso
 * el original se guarda tal cual, al lado, y nunca se deriva.
 */

/** Una pulgada, exacta, en micrómetros. Es la definición internacional desde 1959. */
const MICRAS_POR_PULGADA = 25_400n;

const MICRAS_POR_UNIDAD: Record<string, bigint> = {
  um: 1n,
  mm: 1_000n,
  cm: 10_000n,
  m: 1_000_000n,
  in: MICRAS_POR_PULGADA,
};

/** Cómo se escribió la medida, para poder decir de dónde salió el número. */
export type SistemaDeMedida = 'fraccion_pulgada' | 'decimal_pulgada' | 'metrico';

export interface MedidaNormalizada {
  /** En micrómetros. Entero siempre. */
  readonly micras: bigint;
  readonly sistema: SistemaDeMedida;
  /** Lo que tecleó la persona, intacto. Es lo que la pantalla vuelve a mostrar. */
  readonly original: string;
}

const FRACCION = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/;
const DECIMAL = /^(\d+(?:\.\d+)?|\.\d+)$/;

/**
 * `'1/4"'` → 6350 µm. `'6.35 mm'` → 6350 µm. `'1 1/2"'` → 38100 µm.
 *
 * ── Por qué una fracción sin unidad es PULGADAS ──────────────────────────
 * Porque en este giro nadie escribe una fracción de milímetro. `3/8` es siempre
 * tres octavos de pulgada, y exigir la comilla haría que la mitad de las
 * capturas fallaran por un carácter que el mostradorista no teclea.
 *
 * ── Por qué un decimal SIN unidad también es pulgadas ────────────────────
 * Porque `.25` viene de la lista del distribuidor, que trabaja en pulgadas
 * decimales. Un número pelado en milímetros —`13`— se escribe con su unidad, y
 * ésa es la convención del catálogo de fábrica. Suponer milímetros haría que
 * `.25` fuera un cuarto de milímetro: 25 veces más chico, y el tornillo
 * equivocado.
 */
export function normalizarMedida(texto: string): MedidaNormalizada {
  const original = texto.trim();
  if (original === '') {
    throw new ErrorDominio(CODIGOS_ERROR.CATALOGO_INVALIDO, 'Una medida vacía no es una medida.');
  }

  // Las comillas de pulgada: la recta, la tipográfica y la doble prima.
  const sinComillas = original.replace(/["″”]/gu, ' ').trim();
  const { cuerpo, unidad } = partirUnidad(sinComillas);

  const fraccion = FRACCION.exec(cuerpo);
  if (fraccion !== null) {
    if (unidad !== null && unidad !== 'in') {
      // `3/8 mm` no existe en ninguna lista de ningún distribuidor. Aceptarlo
      // dejaría entrar un dato que nadie va a poder buscar después.
      throw new ErrorDominio(
        CODIGOS_ERROR.CATALOGO_INVALIDO,
        'Las fracciones son de pulgada: en métrico la medida va en decimal.',
        { medida: original },
      );
    }
    const entera = BigInt(fraccion[1] ?? '0');
    const numerador = BigInt(fraccion[2] ?? '0');
    const denominador = BigInt(fraccion[3] ?? '0');
    if (denominador === 0n) {
      throw new ErrorDominio(
        CODIGOS_ERROR.CATALOGO_INVALIDO,
        'Una fracción no se divide entre cero.',
        {
          medida: original,
        },
      );
    }
    // Multiplicar antes de dividir: `1/3"` no cabe exacto y redondear al final
    // deja el error en la micra, no en la décima de milímetro.
    const micras = entera * MICRAS_POR_PULGADA + (numerador * MICRAS_POR_PULGADA) / denominador;
    return { micras, sistema: 'fraccion_pulgada', original };
  }

  if (!DECIMAL.test(cuerpo)) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CATALOGO_INVALIDO,
      'Esa medida no se entiende: usa 1/4", .25 o 6.35 mm.',
      { medida: original },
    );
  }

  const factor = MICRAS_POR_UNIDAD[unidad ?? 'in'];
  if (factor === undefined) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CATALOGO_INVALIDO,
      'Esa unidad de longitud no se conoce.',
      {
        medida: original,
        unidad,
      },
    );
  }

  return {
    micras: escalarDecimal(cuerpo, factor),
    sistema: unidad === null || unidad === 'in' ? 'decimal_pulgada' : 'metrico',
    original,
  };
}

/** `'6.35'` × 1000 → `6350n`, sin pasar por `Number` ni una sola vez. */
function escalarDecimal(texto: string, factor: bigint): bigint {
  const [entera = '0', decimal = ''] = texto.split('.');
  const enteras = BigInt(entera === '' ? '0' : entera) * factor;
  if (decimal === '') return enteras;
  // La parte decimal se escala por el factor y se divide por su propia
  // potencia de diez: `0.35 mm` son `35 × 1000 / 100` micras.
  const potencia = 10n ** BigInt(decimal.length);
  return enteras + (BigInt(decimal) * factor) / potencia;
}

function partirUnidad(texto: string): { readonly cuerpo: string; readonly unidad: string | null } {
  const conUnidad = /^(.*?)\s*(um|µm|mm|cm|m|in|pulg|pulgadas?)$/iu.exec(texto);
  if (conUnidad === null) return { cuerpo: texto.trim(), unidad: null };

  const bruta = (conUnidad[2] ?? '').toLowerCase();
  const unidad = bruta === 'µm' ? 'um' : bruta.startsWith('pulg') ? 'in' : bruta;
  return { cuerpo: (conUnidad[1] ?? '').trim(), unidad };
}

/**
 * ¿Estas dos medidas son la misma pieza?
 *
 * ── Por qué hace falta una tolerancia ────────────────────────────────────
 * Porque `1/2"` es 12,700 µm y la llave métrica equivalente, la de 13 mm, es
 * 13,000: trescientas micras de diferencia y **la misma tuerca**. Comparar por
 * igualdad exacta haría que el mostradorista no encontrara nunca la
 * equivalencia que usa todos los días.
 *
 * ── Por qué la tolerancia se pasa y no se fija ───────────────────────────
 * Porque 300 µm sobre media pulgada es nada y sobre un tornillo de 1/16" es un
 * tornillo distinto. Quien busca sabe en qué línea está; el dominio no.
 */
export function mismaMedida(a: bigint, b: bigint, toleranciaMicras: bigint): boolean {
  if (toleranciaMicras < 0n) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CATALOGO_INVALIDO,
      'Una tolerancia negativa no acepta nada.',
      { toleranciaMicras: toleranciaMicras.toString() },
    );
  }
  const diferencia = a > b ? a - b : b - a;
  return diferencia <= toleranciaMicras;
}

export interface PesoDePieza {
  /** Peso de UNA pieza, en miligramos. Enteros, como todo lo que se mide. */
  readonly pesoPorPiezaMg: bigint;
  /** Desviación aceptada entre lotes, en porcentaje. El giro maneja 3 % a 8 %. */
  readonly toleranciaPct: string;
}

export interface ConteoPorPeso {
  readonly piezas: bigint;
  /** El peso que esas piezas deberían dar, para poder enseñar la diferencia. */
  readonly pesoEsperadoMg: bigint;
  /** `false` cuando la diferencia se sale de la tolerancia declarada. */
  readonly dentroDeTolerancia: boolean;
}

/**
 * F-151 · «Pésame un kilo de tornillo»: cuántas piezas son.
 *
 * ── El error de inventario número uno del giro ───────────────────────────
 * El tornillo se vende por pieza Y por kilo el mismo día. Sin esto, el ferretero
 * duplica la clave —«tornillo por pieza» y «tornillo por kilo»— y a partir de
 * ahí el conteo no cuadra nunca, porque las dos claves comparten el mismo montón
 * físico y ninguna de las dos sabe de la otra.
 *
 * ── Por qué el redondeo es al ENTERO MÁS CERCANO ─────────────────────────
 * Porque lo que se cuenta son tornillos y no hay medios tornillos. Hacia abajo
 * siempre regalaría uno en cada venta grande; hacia arriba cobraría uno de más.
 * Al más cercano, el error se reparte y la tolerancia dice si la pesada tiene
 * sentido.
 *
 * ── Por qué la tolerancia NO bloquea ─────────────────────────────────────
 * Un lote con 8 % de desviación es un lote real, no un fraude. Lo que hace falta
 * es que el mostrador lo SEPA —para recalibrar con una pesada de referencia— no
 * que la venta se detenga con el cliente delante.
 */
export function piezasDesdePeso(pesoMg: bigint, pieza: PesoDePieza): ConteoPorPeso {
  if (pieza.pesoPorPiezaMg <= 0n) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CATALOGO_INVALIDO,
      'Sin peso por pieza no se puede convertir una pesada en piezas.',
      { pesoPorPiezaMg: pieza.pesoPorPiezaMg.toString() },
    );
  }
  if (pesoMg <= 0n) {
    throw new ErrorDominio(CODIGOS_ERROR.CANTIDAD_INVALIDA, 'Una pesada de cero no vende nada.', {
      pesoMg: pesoMg.toString(),
    });
  }

  // Al entero más cercano, con enteros: `(2·peso + pieza) / (2·pieza)`.
  const piezas = (pesoMg * 2n + pieza.pesoPorPiezaMg) / (pieza.pesoPorPiezaMg * 2n);
  if (piezas === 0n) {
    // Media pieza pesada. Cobrar cero sería regalarla; cobrar una sería inventar
    // la mitad que falta. Se dice, que es lo único honesto.
    throw new ErrorDominio(
      CODIGOS_ERROR.CANTIDAD_INVALIDA,
      'Esa pesada no llega ni a una pieza: revisa el peso por pieza.',
      { pesoMg: pesoMg.toString(), pesoPorPiezaMg: pieza.pesoPorPiezaMg.toString() },
    );
  }

  const pesoEsperadoMg = piezas * pieza.pesoPorPiezaMg;
  const diferencia = pesoMg > pesoEsperadoMg ? pesoMg - pesoEsperadoMg : pesoEsperadoMg - pesoMg;
  // La tolerancia va en centésimas de punto porcentual para no tocar coma
  // flotante: `8.00 %` son 800.
  const toleranciaBp = enCentesimasDePunto(pieza.toleranciaPct);
  const margen = (pesoEsperadoMg * toleranciaBp) / 10_000n;

  return { piezas, pesoEsperadoMg, dentroDeTolerancia: diferencia <= margen };
}

/** `'8.00'` → `800n`. Centésimas de punto porcentual, enteras. */
function enCentesimasDePunto(porcentaje: string): bigint {
  const limpio = porcentaje.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpio)) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'La tolerancia va en porcentaje, con hasta dos decimales.',
      { porcentaje },
    );
  }
  const [entera = '0', decimal = ''] = limpio.split('.');
  return BigInt(entera) * 100n + BigInt(decimal.padEnd(2, '0'));
}
