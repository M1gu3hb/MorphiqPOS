import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { deEscalaCompleta, enEscalaCompleta } from './escala.ts';

/**
 * F-108 · Cuánto dinero hay dormido en el almacén, y desde cuándo.
 *
 * ── Qué decide de verdad este número ───────────────────────────────────────
 * No es contabilidad: es la decisión de rematar. Un ferretero con $400 000 en
 * existencias y $180 000 de ellos sin moverse en un año está financiando su
 * propio estante con el dinero que le falta para la nómina. Hoy no puede
 * contestar ninguna de las dos preguntas —cuánto, y desde cuándo— y por eso el
 * `01-FUNCIONES.md` de ferretería la llama «el dolor 2 completo».
 *
 * ── Los dos métodos, y por qué sólo dos ────────────────────────────────────
 * `promedio` es el que entiende cualquiera y el que se usa: el costo promedio
 * ponderado del insumo. `peps` es el que pide el contador. UEPS no está a
 * propósito: en México no se acepta fiscalmente desde 2005, y ofrecerlo sería
 * ofrecer un número que su contador no le va a dejar usar.
 */

export type MetodoDeValuacion = 'promedio' | 'peps';

/** Una capa de compra: cuánto entró, a qué costo y cuándo. Para PEPS. */
export interface CapaDeCosto {
  readonly cantidad: string;
  readonly costoUnitarioCentavos: bigint;
  readonly cuando: Date;
}

export interface ArticuloParaValuar {
  readonly insumoId: string;
  /** La existencia de hoy, tal cual está en la tabla. */
  readonly existencia: string;
  /** El costo promedio ponderado que lleva el insumo. */
  readonly costoPromedioCentavos: bigint;
  /** Las capas de entrada, de la más vieja a la más nueva. Sólo hacen falta en PEPS. */
  readonly capas?: readonly CapaDeCosto[];
  /** Cuándo se movió por última vez. `null` si nunca se ha movido. */
  readonly ultimoMovimiento: Date | null;
}

export interface LineaValuada {
  readonly insumoId: string;
  readonly cantidad: string;
  readonly costoUnitarioCentavos: bigint;
  readonly valorCentavos: bigint;
  /** Días sin moverse. Es la mitad de la respuesta, y la que nadie tiene hoy. */
  readonly diasSinMovimiento: number | null;
}

export interface Valuacion {
  readonly metodo: MetodoDeValuacion;
  readonly lineas: readonly LineaValuada[];
  readonly valorCentavos: bigint;
  readonly articulos: number;
  /** El valor de lo que lleva más de `umbralDias` sin moverse. */
  readonly valorDormidoCentavos: bigint;
}

export interface OpcionesDeValuacion {
  readonly metodo: MetodoDeValuacion;
  readonly ahora: Date;
  /** A partir de cuántos días se considera dormido. 180 es el del giro. */
  readonly umbralDias?: number;
}

const DIAS_DORMIDO = 180;
const MS_POR_DIA = 86_400_000;
const ESCALA = 10_000n;

/**
 * Valúa el inventario en un instante.
 *
 * ── Por qué las existencias negativas NO se valúan ─────────────────────────
 * Una existencia negativa es un dato roto —se vendió algo que el sistema creía
 * agotado— y valuarla en negativo restaría del total, haciendo que el almacén
 * valga menos de lo que hay en el estante. Se cuenta como cero y se deja el
 * renglón visible, para que se vea que existe en vez de taparlo.
 */
export function valuarInventario(
  articulos: readonly ArticuloParaValuar[],
  opciones: OpcionesDeValuacion,
): Valuacion {
  const umbral = opciones.umbralDias ?? DIAS_DORMIDO;
  const lineas: LineaValuada[] = [];
  let total = 0n;
  let dormido = 0n;

  for (const articulo of articulos) {
    const existencia = deEscalaCompleta(articulo.existencia);
    const cantidad = existencia > 0n ? existencia : 0n;

    const costo =
      opciones.metodo === 'peps' ? costoPeps(cantidad, articulo) : articulo.costoPromedioCentavos;

    const valor = valorDe(cantidad, costo);
    const dias = diasSinMoverse(articulo.ultimoMovimiento, opciones.ahora);

    lineas.push({
      insumoId: articulo.insumoId,
      cantidad: enEscalaCompleta(cantidad),
      costoUnitarioCentavos: costo,
      valorCentavos: valor,
      diasSinMovimiento: dias,
    });

    total += valor;
    if (dias !== null && dias >= umbral) dormido += valor;
  }

  return {
    metodo: opciones.metodo,
    lineas,
    valorCentavos: total,
    articulos: lineas.length,
    valorDormidoCentavos: dormido,
  };
}

/**
 * El costo unitario PEPS: el promedio de las capas que cubren la existencia,
 * empezando por la MÁS NUEVA.
 *
 * Suena al revés y no lo es. «Primeras entradas, primeras salidas» significa que
 * lo que ya SALIÓ fue lo más viejo; por tanto **lo que queda en el estante son
 * las capas más nuevas**. Valuarlo con las viejas es el error clásico de PEPS y
 * subvalúa el inventario justo cuando los precios suben, que es siempre.
 */
function costoPeps(cantidad: bigint, articulo: ArticuloParaValuar): bigint {
  const capas = articulo.capas ?? [];
  if (cantidad === 0n) return articulo.costoPromedioCentavos;
  if (capas.length === 0) return articulo.costoPromedioCentavos;

  let porCubrir = cantidad;
  let acumulado = 0n;

  for (let i = capas.length - 1; i >= 0 && porCubrir > 0n; i -= 1) {
    const capa = capas[i];
    if (capa === undefined) continue;
    const disponible = deEscalaCompleta(capa.cantidad);
    if (disponible <= 0n) continue;
    const toma = disponible < porCubrir ? disponible : porCubrir;
    acumulado += toma * capa.costoUnitarioCentavos;
    porCubrir -= toma;
  }

  if (porCubrir > 0n) {
    // Hay más existencia que capas conocidas: el histórico no llega tan atrás.
    // Se completa con el promedio en vez de fallar, porque un almacén sin
    // histórico completo es lo normal el primer año y negarse a valuarlo sería
    // negarse a contestar la pregunta que importa.
    acumulado += porCubrir * articulo.costoPromedioCentavos;
  }

  return redondear(acumulado, cantidad);
}

function diasSinMoverse(ultimo: Date | null, ahora: Date): number | null {
  if (ultimo === null) return null;
  const transcurrido = ahora.getTime() - ultimo.getTime();
  if (transcurrido < 0) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'El último movimiento está en el futuro: la valuación no se puede fechar.',
    );
  }
  return Math.floor(transcurrido / MS_POR_DIA);
}

/** `cantidad × costo`, desandando la escala una sola vez y redondeando al centavo. */
function valorDe(cantidad: bigint, costoUnitario: bigint): bigint {
  return redondear(cantidad * costoUnitario, ESCALA);
}

/** División con redondeo al entero más cercano. Nunca trunca hacia abajo. */
function redondear(numerador: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return 0n;
  const mitad = divisor / 2n;
  return numerador < 0n ? -((-numerador + mitad) / divisor) : (numerador + mitad) / divisor;
}
