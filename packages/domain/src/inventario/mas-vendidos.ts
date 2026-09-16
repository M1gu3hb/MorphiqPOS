import { ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * F-051 · Los más vendidos, y por qué en una ferretería no es un ranking.
 *
 * ── El error de mirar sólo las unidades ──────────────────────────────────
 * La lista de «más vendidos» por piezas de una ferretería la encabezan los
 * tornillos: se venden a miles y dejan centavos. La lista por DINERO la
 * encabeza el cemento. Y la lista que de verdad decide qué comprar es una
 * tercera: la de lo que más margen deja POR PESO INVERTIDO, porque el cuello de
 * botella de una ferretería no es el espacio, es el capital parado en el patio.
 *
 * Por eso esto no devuelve «los más vendidos»: devuelve las tres cifras juntas
 * y deja que quien mira decida. Una sola cifra con nombre de ranking es lo que
 * hace que el dueño compre más de lo que ya le sobra.
 *
 * ── Y por qué el periodo es OBLIGATORIO ──────────────────────────────────
 * Un acumulado desde el principio de los tiempos premia a lo que lleva años en
 * el catálogo y esconde lo que empezó a moverse el mes pasado — que es
 * exactamente lo que hay que ver. Sin ventana, el reporte dice lo mismo cada
 * mes y deja de mirarse.
 */

export interface VentaDeProducto {
  readonly productoId: string;
  readonly nombre: string;
  /** Unidades vendidas en la ventana, en la unidad base. */
  readonly unidades: number;
  readonly ingresoCentavos: bigint;
  readonly costoCentavos: bigint;
  /** Lo que hay parado en el almacén ahora mismo, valuado. */
  readonly inventarioCentavos: bigint;
}

export interface FilaDeRanking {
  readonly productoId: string;
  readonly nombre: string;
  readonly unidades: number;
  readonly ingresoCentavos: bigint;
  readonly margenCentavos: bigint;
  /**
   * Margen por cada 100 pesos parados en inventario, en centavos.
   *
   * `null` cuando no hay inventario: dividir entre cero daría infinito y
   * pondría arriba de la lista lo que ya se acabó, que es el consejo contrario
   * al que hace falta.
   */
  readonly margenPorCapitalBp: number | null;
}

export type Criterio = 'unidades' | 'ingreso' | 'margen' | 'capital';

/** Lo que hace falta para poder comparar: el margen y su rendimiento. */
export function componerRanking(ventas: readonly VentaDeProducto[]): readonly FilaDeRanking[] {
  return ventas.map((v) => {
    if (v.unidades < 0) {
      throw new ErrorDominio('CANTIDAD_INVALIDA', `«${v.nombre}» tiene unidades negativas.`);
    }
    const margen = v.ingresoCentavos - v.costoCentavos;
    return {
      productoId: v.productoId,
      nombre: v.nombre,
      unidades: v.unidades,
      ingresoCentavos: v.ingresoCentavos,
      margenCentavos: margen,
      margenPorCapitalBp:
        v.inventarioCentavos <= 0n ? null : Number((margen * 10_000n) / v.inventarioCentavos),
    };
  });
}

/**
 * F-051 · Ordena por el criterio que se pida, y desempata por nombre.
 *
 * El desempate no es cosmético: sin él, dos productos con el mismo número
 * cambian de orden entre una consulta y la siguiente, y un reporte que se
 * reordena solo deja de creerse.
 */
export function ordenarPor(
  filas: readonly FilaDeRanking[],
  criterio: Criterio,
): readonly FilaDeRanking[] {
  const valor = (f: FilaDeRanking): number => {
    switch (criterio) {
      case 'unidades':
        return f.unidades;
      case 'ingreso':
        return Number(f.ingresoCentavos);
      case 'margen':
        return Number(f.margenCentavos);
      case 'capital':
        // Lo que no tiene inventario va al final y no al principio: recomendar
        // comprar más de lo que ya se acabó es el consejo contrario.
        return f.margenPorCapitalBp ?? Number.NEGATIVE_INFINITY;
    }
  };
  return [...filas].sort((a, b) => {
    const diferencia = valor(b) - valor(a);
    return diferencia === 0 ? a.nombre.localeCompare(b.nombre, 'es-MX') : diferencia;
  });
}

/**
 * F-051 · Lo que se vende mucho y deja poco.
 *
 * Es la lista que de verdad cambia decisiones: está entre los primeros por
 * unidades y entre los últimos por margen. Nadie la pide con esas palabras, y
 * por eso hay que enseñarla sin que la pidan.
 */
export function vendeMuchoDejaPoco(
  filas: readonly FilaDeRanking[],
  cuantos = 5,
): readonly FilaDeRanking[] {
  if (!Number.isInteger(cuantos) || cuantos <= 0) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Cuántos enseñar es un entero > 0.');
  }
  const porUnidades = ordenarPor(filas, 'unidades');
  const porMargen = ordenarPor(filas, 'margen');
  const mitad = Math.ceil(filas.length / 2);

  const bajoMargen = new Set(porMargen.slice(mitad).map((f) => f.productoId));
  return porUnidades.filter((f) => bajoMargen.has(f.productoId)).slice(0, cuantos);
}
