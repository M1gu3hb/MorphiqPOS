/**
 * DE LA NOTA IMPORTADA A LA ENTRADA (F-631; C.10 de la 2.4).
 *
 * `compras.importar_nota` PROPONE: con qué insumo casó cada renglón, por qué y con
 * qué presentación. Esto reparte esa propuesta en lo que la pantalla sabe pintar:
 * las PARTIDAS que van a entrar —las que casaron por nombre, marcadas para
 * revisarlas—, las líneas SIN EMPAREJAR —que se resuelven con el alta rápida o se
 * quedan fuera— y las SUBIDAS DE COSTO con su precio sugerido. Nada de esto guarda:
 * guardar es `compras.recibir_entrada`, con el botón de siempre.
 *
 * Y el comparativo de «escanear contra pedido»: lo pedido —la sugerencia que se le
 * mandó al proveedor— contra lo que llegó, renglón por renglón.
 */

/** Un renglón tal como lo devuelve `compras.importar_nota`. */
export interface RenglonImportado {
  readonly indice: number;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly costoUnitarioCentavos: string;
  readonly productoId: string | null;
  readonly productoNombre: string | null;
  readonly insumoId: string | null;
  readonly unidadCompra: string | null;
  readonly equivalencia: string | null;
  readonly porQue: string;
  readonly dudoso: boolean;
  readonly variacionCostoBp: number | null;
  readonly costoAnteriorCentavos: string | null;
  readonly costoNuevoCentavos: string | null;
  readonly precioVentaCentavos: string | null;
  readonly precioSugeridoCentavos: string | null;
}

export interface ResultadoDeImportar {
  readonly renglones: readonly RenglonImportado[];
}

/** Una partida lista para `lineaDeCompra`, con de dónde salió. */
export interface PartidaDeLaNota {
  /** Única en la nota: dos renglones pueden ser el mismo material. */
  readonly clave: string;
  readonly insumoId: string;
  readonly nombre: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly equivalencia: string;
  /** Lo que costó el renglón COMPLETO, en pesos y como texto. */
  readonly costoTotal: string;
  /** Casó por nombre: el único camino que se equivoca. Se revisa antes de guardar. */
  readonly porNombre: boolean;
  /** Lo que decía la hoja del proveedor, para revisar lo que casó por nombre. */
  readonly delProveedor: string | null;
  /** La clave de SU hoja: se guarda con la línea y empareja sola la nota siguiente. */
  readonly claveProveedor: string | null;
}

export interface LineaPorResolver {
  readonly id: string;
  readonly codigoProveedor: string;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly costoUnitarioCentavos: number;
}

export interface SubidaDeLaNota {
  readonly id: string;
  readonly material: string;
  readonly costoAnteriorCentavos: number;
  readonly costoNuevoCentavos: number;
  readonly precioHoyCentavos: number;
  readonly precioSugeridoCentavos: number;
}

/** Costo unitario × cantidad, al centavo y medio hacia arriba, con enteros. */
export function importeDe(costoUnitarioCentavos: number, cantidad: string): number {
  const [enteros = '0', decimales = ''] = cantidad.split('.');
  const diezmilesimas = BigInt(enteros) * 10_000n + BigInt(decimales.padEnd(4, '0').slice(0, 4));
  return Number((BigInt(costoUnitarioCentavos) * diezmilesimas + 5_000n) / 10_000n);
}

/** `12345` → `'123.45'`: el texto en pesos que pide `lineaDeCompra`. */
export function pesosDe(centavos: number): string {
  const entero = Math.trunc(centavos / 100);
  return `${String(entero)}.${String(centavos % 100).padStart(2, '0')}`;
}

export interface NotaRepartida {
  readonly partidas: readonly PartidaDeLaNota[];
  readonly porResolver: readonly LineaPorResolver[];
  readonly subidas: readonly SubidaDeLaNota[];
}

/**
 * Reparte lo que propuso el servidor. `claves` son las del proveedor por renglón
 * (el servidor no las devuelve: son de la hoja), para el alta rápida.
 */
export function repartirLaNota(
  resultado: ResultadoDeImportar,
  claves: readonly (string | null)[],
): NotaRepartida {
  const partidas: PartidaDeLaNota[] = [];
  const porResolver: LineaPorResolver[] = [];
  const subidas: SubidaDeLaNota[] = [];
  for (const renglon of resultado.renglones) {
    const costo = Number(renglon.costoUnitarioCentavos);
    if (renglon.insumoId === null) {
      porResolver.push({
        id: `renglon-${String(renglon.indice)}`,
        codigoProveedor: claves[renglon.indice] ?? `R${String(renglon.indice + 1)}`,
        descripcion: renglon.descripcion,
        cantidad: renglon.cantidad,
        costoUnitarioCentavos: costo,
      });
      continue;
    }
    const nombre = renglon.productoNombre ?? renglon.descripcion;
    partidas.push({
      clave: `renglon-${String(renglon.indice)}`,
      insumoId: renglon.insumoId,
      nombre,
      cantidad: renglon.cantidad,
      unidad: renglon.unidadCompra ?? 'pieza',
      equivalencia: renglon.equivalencia ?? '1',
      costoTotal: pesosDe(importeDe(costo, renglon.cantidad)),
      porNombre: renglon.dudoso,
      delProveedor: renglon.dudoso ? renglon.descripcion : null,
      claveProveedor: claves[renglon.indice] ?? null,
    });
    const { productoId } = renglon;
    const subio =
      renglon.variacionCostoBp !== null &&
      renglon.variacionCostoBp > 0 &&
      renglon.precioSugeridoCentavos !== null &&
      renglon.precioVentaCentavos !== null &&
      renglon.costoAnteriorCentavos !== null &&
      renglon.costoNuevoCentavos !== null;
    if (subio && productoId !== null && !subidas.some((s) => s.id === productoId)) {
      subidas.push({
        id: productoId,
        material: nombre,
        costoAnteriorCentavos: Number(renglon.costoAnteriorCentavos),
        costoNuevoCentavos: Number(renglon.costoNuevoCentavos),
        precioHoyCentavos: Number(renglon.precioVentaCentavos),
        precioSugeridoCentavos: Number(renglon.precioSugeridoCentavos),
      });
    }
  }
  return { partidas, porResolver, subidas };
}

/** Lo que se le pidió a un material y lo que llegó, para «escanear contra pedido». */
export interface RenglonDelComparativo {
  readonly insumoId: string;
  readonly material: string;
  /** Lo sugerido, ya con su unidad: «4 rollos». `null` si no estaba en el pedido. */
  readonly pedido: string | null;
  readonly pedidoPresentaciones: number;
  readonly llegoPresentaciones: number;
  readonly estado: 'completo' | 'falta' | 'no_llego' | 'sobra' | 'no_se_pidio';
}

export interface LoPedido {
  readonly id: string;
  readonly material: string;
  readonly sugerido: string;
  readonly presentaciones: number;
}

/**
 * Lo pedido contra lo que llegó. Lo que se pidió y no llegó va primero: es lo que
 * se le reclama al repartidor antes de firmar; lo que llegó sin pedirse, después.
 */
export function compararContraPedido(
  pedido: readonly LoPedido[],
  llego: readonly Pick<PartidaDeLaNota, 'insumoId' | 'nombre' | 'cantidad'>[],
): readonly RenglonDelComparativo[] {
  const recibido = new Map<string, number>();
  for (const partida of llego) {
    recibido.set(
      partida.insumoId,
      (recibido.get(partida.insumoId) ?? 0) + Number(partida.cantidad),
    );
  }
  const pedidos = pedido
    .filter((p) => p.presentaciones > 0)
    .map((p): RenglonDelComparativo => {
      const llegaron = recibido.get(p.id) ?? 0;
      const estado =
        llegaron === 0
          ? 'no_llego'
          : llegaron < p.presentaciones
            ? 'falta'
            : llegaron > p.presentaciones
              ? 'sobra'
              : 'completo';
      return {
        insumoId: p.id,
        material: p.material,
        pedido: p.sugerido,
        pedidoPresentaciones: p.presentaciones,
        llegoPresentaciones: llegaron,
        estado,
      };
    });
  const pedidosIds = new Set(pedidos.map((p) => p.insumoId));
  const sinPedir = new Map<string, RenglonDelComparativo>();
  for (const partida of llego) {
    if (pedidosIds.has(partida.insumoId) || sinPedir.has(partida.insumoId)) continue;
    sinPedir.set(partida.insumoId, {
      insumoId: partida.insumoId,
      material: partida.nombre,
      pedido: null,
      pedidoPresentaciones: 0,
      llegoPresentaciones: recibido.get(partida.insumoId) ?? 0,
      estado: 'no_se_pidio',
    });
  }
  const peso = { no_llego: 0, falta: 1, sobra: 2, completo: 3, no_se_pidio: 4 } as const;
  return [...pedidos, ...sinPedir.values()].sort((a, b) => peso[a.estado] - peso[b.estado]);
}
