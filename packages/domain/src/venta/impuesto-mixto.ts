import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-011 · IVA mixto por línea, e IEPS con sus tres mecánicas.
 *
 * ── Por qué el tronco no sirve aquí, y no es una preferencia ─────────────
 * `calcularTotales` aplica UNA tasa a toda la orden, y eso es correcto en un
 * restaurante: el menú entero va al 16 %. En una tiendita el frijol, la leche,
 * el pan, el huevo y la fruta son tasa 0 % por ley (LIVA art. 2-A), y el
 * refresco, el jabón y el cloro son 16 %. En la misma tienda, en el mismo
 * ticket, en la misma bolsa. Una tasa única no es una simplificación: es una
 * declaración mal presentada desde el primer mes.
 *
 * ── Por qué NO se puede hacer `total − round(total / 1.16)` ──────────────
 * Porque el total mezcla tasas. La única forma correcta es extraer POR LÍNEA
 * con la tasa de esa línea, agrupar por tasa, y redondear UNA SOLA VEZ al
 * cerrar el bloque de cada tasa. Redondear por línea descuadra un ticket de
 * catorce artículos por centavos, y el tendero pierde la confianza en todo lo
 * demás — que es lo caro, no los centavos.
 *
 * ── El IEPS son TRES mecánicas distintas, no un porcentaje más ───────────
 *   · cuota por LITRO   — bebidas saborizadas con azúcar: $3.0818/L en 2026;
 *                         con edulcorantes, $1.50/L.
 *   · ad valorem        — botanas ≥275 kcal/100 g: 8 %. Energizantes: 25 %.
 *   · cuota por PIEZA   — cigarros, además de su 200 % ad valorem.
 *
 * Modelarlo como un porcentaje obligaría a inventar un equivalente por producto
 * y a recalcularlo cada enero, cuando la cuota se actualiza por inflación.
 *
 * ── Y el IEPS va DENTRO del precio de anaquel ────────────────────────────
 * Igual que el IVA. El precio de la etiqueta ya lo trae, así que se extrae; y
 * se extrae ANTES que el IVA, porque el IVA se causa sobre el precio que ya
 * incluye IEPS. Hacerlo al revés da un IVA menor y una base de IEPS mayor: el
 * error no salta, sólo declara mal.
 */

/** Los puntos base de un 100 %. `0.16` no existe exacto en punto flotante. */
const PUNTOS_BASE_100 = 10_000;

/** Las tres tasas de IVA que conviven en el mismo anaquel mexicano. */
export type TasaIva = 0 | 800 | 1600;

export type FormaIeps =
  | { readonly forma: 'ninguna' }
  /** Cuota fija por litro. `litros` viene del producto. */
  | { readonly forma: 'cuota_litro'; readonly cuotaCentavosPorLitro: bigint }
  /** Porcentaje sobre el precio sin IEPS. */
  | { readonly forma: 'ad_valorem'; readonly tasaBp: number }
  /** Cuota fija por pieza, como el cigarro. */
  | { readonly forma: 'cuota_pieza'; readonly cuotaCentavosPorPieza: bigint };

export interface LineaConImpuesto {
  readonly id: string;
  /** Lo que dice la etiqueta, por la cantidad. Ya trae IVA e IEPS dentro. */
  readonly importeCentavos: bigint;
  readonly tasaIvaBp: TasaIva;
  readonly ieps: FormaIeps;
  /** Litros que suma esta línea. Sólo se usa con `cuota_litro`. */
  readonly litros?: number;
  /** Piezas que suma esta línea. Sólo se usa con `cuota_pieza`. */
  readonly piezas?: number;
}

export interface BloqueDeTasa {
  readonly tasaIvaBp: TasaIva;
  readonly baseCentavos: bigint;
  readonly ivaCentavos: bigint;
}

export interface DesgloseFiscal {
  readonly totalCentavos: bigint;
  readonly subtotalCentavos: bigint;
  readonly ivaCentavos: bigint;
  readonly iepsCentavos: bigint;
  /** Un renglón por tasa, que es lo que el ticket tiene que poder imprimir. */
  readonly porTasa: readonly BloqueDeTasa[];
}

/** Las diezmilésimas con que viajan litros y piezas, sin punto flotante. */
const ESCALA = 10_000n;

function aEscala(valor: number, campo: string): bigint {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', `«${campo}» tiene que ser un número no negativo.`);
  }
  return BigInt(Math.round(valor * 10_000));
}

/**
 * Lo que de IEPS trae dentro esta línea.
 *
 * El ad valorem se extrae del importe: si el precio incluye un IEPS del 8 %, la
 * parte de IEPS es `importe × 800 / 10800` y no `importe × 8 %`. Calcularlo
 * como porcentaje del precio final —que es el error de siempre— da un IEPS
 * mayor del que se causó.
 */
function iepsDe(linea: LineaConImpuesto): bigint {
  switch (linea.ieps.forma) {
    case 'ninguna':
      return 0n;
    case 'cuota_litro':
      return (linea.ieps.cuotaCentavosPorLitro * aEscala(linea.litros ?? 0, 'litros')) / ESCALA;
    case 'cuota_pieza':
      return (linea.ieps.cuotaCentavosPorPieza * aEscala(linea.piezas ?? 0, 'piezas')) / ESCALA;
    case 'ad_valorem': {
      const tasa = BigInt(linea.ieps.tasaBp);
      if (tasa < 0n || tasa > 100_000n) {
        throw new ErrorDominio('DINERO_PORCENTAJE_INVALIDO', 'Tasa de IEPS fuera de rango.');
      }
      return (linea.importeCentavos * tasa) / (BigInt(PUNTOS_BASE_100) + tasa);
    }
  }
}

/**
 * F-011 · El desglose de un ticket con tasas mezcladas.
 *
 * El orden importa y es éste:
 *   1 · de cada línea se extrae su IEPS,
 *   2 · lo que queda se agrupa POR TASA de IVA,
 *   3 · y el IVA se extrae UNA VEZ por bloque de tasa.
 *
 * El paso 3 es el que evita el descuadre: catorce líneas al 16 % redondeadas
 * por separado pueden diferir en siete centavos del mismo cálculo hecho sobre
 * su suma, y ésos son los siete centavos que hacen que el tendero deje de
 * creerle al ticket.
 */
export function desglosarImpuestos(lineas: readonly LineaConImpuesto[]): DesgloseFiscal {
  const porTasa = new Map<TasaIva, bigint>();
  let totalCentavos = 0n;
  let iepsCentavos = 0n;

  for (const linea of lineas) {
    if (linea.importeCentavos < 0n) {
      throw new ErrorDominio('CANTIDAD_INVALIDA', `La línea ${linea.id} tiene importe negativo.`);
    }
    totalCentavos += linea.importeCentavos;

    const ieps = iepsDe(linea);
    if (ieps > linea.importeCentavos) {
      // Pasa de verdad con una cuota por litro mal capturada: un refresco de
      // $18 con «10 litros» daría un IEPS de $30. Cortarlo aquí es lo que
      // impide que el subtotal salga negativo y el ticket imprima un absurdo.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `El IEPS de la línea ${linea.id} es mayor que su importe: revisa litros o piezas.`,
      );
    }
    iepsCentavos += ieps;

    const sinIeps = linea.importeCentavos - ieps;
    porTasa.set(linea.tasaIvaBp, (porTasa.get(linea.tasaIvaBp) ?? 0n) + sinIeps);
  }

  const bloques: BloqueDeTasa[] = [];
  let ivaCentavos = 0n;
  // De menor a mayor, para que el ticket imprima siempre en el mismo orden: un
  // desglose que cambia de orden entre tickets parece dos cálculos distintos.
  for (const tasa of [0, 800, 1600] as const) {
    const conIva = porTasa.get(tasa);
    if (conIva === undefined) continue;
    const tasaBp = BigInt(tasa);
    // UNA división por bloque. `conIva × tasa / (10 000 + tasa)`.
    const iva = (conIva * tasaBp) / (BigInt(PUNTOS_BASE_100) + tasaBp);
    ivaCentavos += iva;
    bloques.push({ tasaIvaBp: tasa, baseCentavos: conIva - iva, ivaCentavos: iva });
  }

  return {
    totalCentavos,
    subtotalCentavos: totalCentavos - ivaCentavos - iepsCentavos,
    ivaCentavos,
    iepsCentavos,
    porTasa: bloques,
  };
}
