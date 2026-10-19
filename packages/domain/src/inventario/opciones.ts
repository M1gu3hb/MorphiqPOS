import {
  ESCALA_CANTIDAD,
  cantidad,
  cantidadATexto,
  desdeDiezmilesimas,
} from '../catalogo/cantidades.ts';
import { mismaDimension } from '../catalogo/unidades.ts';

/**
 * F-027 · LA RECETA QUE DE VERDAD SE PREPARÓ: la de catálogo, con las opciones que
 * eligió el cliente (C.10 de la 2.4).
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 * La 084 dejó las tres columnas —la línea que un grupo puede sustituir, el insumo
 * con el que sustituye cada opción y cuánto escala la receta— y NADIE las leía al
 * cobrar. Un latte de avena descontaba 180 ml de leche entera; un latte de 16 oz
 * descontaba lo de uno de 12. La avena no bajaba nunca, la entera bajaba de más,
 * el vaso grande salía del almacén como si fuera el chico, y el conteo del viernes
 * lo cobraba todo junto como «merma».
 *
 * ── Qué hace cada efecto ───────────────────────────────────────────────────
 * · SUSTITUIR: la línea que declara `sustituiblePorGrupoId` cambia su insumo por el
 *   de la opción elegida de ESE grupo. Sólo esa línea: la leche del latte se vuelve
 *   avena y el espresso sigue siendo espresso.
 * · ESCALAR: el factor multiplica las líneas que se MIDEN —gramos, mililitros— de toda
 *   la receta —el 16 oz es 1.44 del 12— y los factores de varias opciones se
 *   multiplican entre sí.
 *
 * ── Lo que se CUENTA no se escala ──────────────────────────────────────────
 * Un latte de 16 oz lleva un vaso, no 1.44 vasos de 12. Las líneas en piezas —el
 * vaso, la tapa, la galleta de cortesía— quedan como están, y el vaso grande se
 * declara como lo que es: la línea del vaso la sustituye el grupo «Tamaño», y la
 * opción «16 oz» dice con qué vaso. Escalar piezas descontaría fracciones de vaso que
 * no existen y el conteo del viernes nunca cuadraría (D-22).
 *
 * ── Lo que no se sustituye, y por qué no se inventa ────────────────────────
 * Si el sustituto se mide en otra dimensión —la opción dice «avena» en gramos y la
 * línea la pide en mililitros—, la línea se queda como está: el dominio no sabe
 * cuántos gramos es un mililitro de avena y NO lo supone. Cobrar tiene que seguir
 * funcionando; lo que falla es la configuración, y quien la guarda lo ve.
 */
export interface EfectoDeOpcion {
  /** El grupo al que pertenece la opción elegida: «Leche», «Tamaño». */
  readonly grupoId: string;
  /** Con qué insumo sustituye a la línea que su grupo puede reemplazar. */
  readonly insumoSustitutoId: string | null;
  /** La unidad base de ese insumo: la conversión la hace el consumo, no aquí. */
  readonly unidadBaseSustituto: string | null;
  /** Cuánto escala la receta entera, en texto de hasta cuatro decimales. */
  readonly factor: string;
}

export interface LineaConOpciones {
  readonly insumoId: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly unidadBase: string;
  readonly sustituiblePorGrupoId?: string | null;
}

/** El producto de los factores, en diezmilésimas: `1.44 × 1.0` = 1.44. */
function factorTotal(efectos: readonly EfectoDeOpcion[]): bigint {
  let total = ESCALA_CANTIDAD;
  for (const efecto of efectos) {
    total = redondearAEscala(total * cantidad(efecto.factor));
  }
  return total;
}

/**
 * De ocho decimales a los cuatro del inventario, al medio hacia arriba.
 *
 * Aquí SÍ se redondea, y es la única diferencia con `cantidadExacta`: la razón de
 * dos volúmenes casi nunca es redonda (16/12 = 1.3333…), y 18.005 g × 1.3333 no cabe
 * en cuatro decimales. La diezmilésima de gramo es la precisión del ledger; negarse
 * a cobrar el latte grande por ella sería peor que el redondeo.
 */
function redondearAEscala(valor: bigint): bigint {
  return (valor + ESCALA_CANTIDAD / 2n) / ESCALA_CANTIDAD;
}

export function recetaConOpciones<T extends LineaConOpciones>(
  receta: readonly T[],
  efectos: readonly EfectoDeOpcion[],
): T[] {
  if (efectos.length === 0) return [...receta];
  const factor = factorTotal(efectos);
  const sustitutos = new Map(
    efectos
      .filter((e) => e.insumoSustitutoId !== null && e.unidadBaseSustituto !== null)
      .map((e) => [e.grupoId, e] as const),
  );

  return receta.map((linea) => {
    const grupo = linea.sustituiblePorGrupoId ?? null;
    const sustituto = grupo === null ? undefined : sustitutos.get(grupo);
    const escalada =
      factor === ESCALA_CANTIDAD || mismaDimension(linea.unidad, 'pieza')
        ? linea.cantidad
        : cantidadATexto(desdeDiezmilesimas(redondearAEscala(cantidad(linea.cantidad) * factor)));
    const cambia =
      sustituto?.insumoSustitutoId != null &&
      sustituto.unidadBaseSustituto !== null &&
      mismaDimension(linea.unidad, sustituto.unidadBaseSustituto);
    return {
      ...linea,
      cantidad: escalada,
      ...(cambia
        ? { insumoId: sustituto.insumoSustitutoId, unidadBase: sustituto.unidadBaseSustituto }
        : {}),
    };
  });
}
