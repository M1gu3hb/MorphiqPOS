import { ErrorDominio } from '@morphiqpos/contracts/errores';

import {
  cantidadATexto,
  desdeDiezmilesimas,
  normalizarUnidad,
  type Cantidad,
  type Unidad,
} from '../catalogo/index.ts';
import {
  consumoDeInsumoBase,
  consumoDeReceta,
  consumoDeSku,
  positiva,
  type CapturaDeInsumoBase,
  type IngredienteReceta as IngredienteRecetaV6,
} from './variantes/v6-receta-y-peso.ts';
import type { ConsumoDeInsumo } from './variantes/tipos.ts';

export type EstrategiaConsumo = 'sku' | 'receta' | 'insumo_base' | 'ninguno';
export type UnidadInventario = Exclude<Unidad, 'caja' | 'paquete'>;

interface ContextoLinea {
  readonly organizacionId: string;
  readonly almacenId: string;
  readonly ordenId: string;
  readonly lineaId: string;
  readonly empleadoId?: string;
  /** Cantidad lógica de productos en la línea. */
  readonly cantidad: string;
  readonly permiteVentaSinStock: boolean;
}

/**
 * Se reexporta desde la variante V6, que es donde vive desde la extracción.
 * El alias conserva el nombre que ya consumen `packages/app` y `packages/data`:
 * mover un tipo no es razón para tocar a quien lo importa.
 */
export type IngredienteReceta = IngredienteRecetaV6;

export type LineaParaConsumo =
  | (ContextoLinea & {
      readonly estrategiaConsumo: 'sku';
      readonly insumoId: string;
      readonly unidadVenta: string;
      readonly unidadBase: string;
    })
  | (ContextoLinea & {
      readonly estrategiaConsumo: 'receta';
      readonly receta: readonly IngredienteReceta[];
    })
  | (ContextoLinea & {
      readonly estrategiaConsumo: 'insumo_base';
      readonly insumoId: string;
      readonly unidadBase: string;
      readonly captura: CapturaDeInsumoBase;
    })
  | (ContextoLinea & { readonly estrategiaConsumo: 'ninguno' });

export interface MovimientoPlaneado {
  readonly organizacionId: string;
  readonly almacenId: string;
  readonly insumoId: string;
  readonly tipo: 'salida_venta';
  /** Cantidad positiva que el repositorio resta de existencias. */
  readonly cantidad: string;
  readonly unidad: UnidadInventario;
  readonly permiteNegativo: boolean;
  readonly referenciaTipo: 'orden';
  readonly referenciaId: string;
  readonly empleadoId?: string;
  readonly idempotencyKey: string;
  readonly origenes: readonly string[];
}

interface Acumulado {
  readonly contexto: ContextoLinea;
  readonly insumoId: string;
  readonly unidad: UnidadInventario;
  cantidad: Cantidad;
  permiteNegativo: boolean;
  readonly origenes: string[];
}

/**
 * Convierte líneas persistidas en decrementos de stock. No consulta catálogo ni
 * existencias: quien cobra carga los snapshots y ejecuta el resultado en su tx.
 */
export function calcularConsumo(lineas: LineaParaConsumo[]): MovimientoPlaneado[] {
  verificarUnSoloContexto(lineas);
  const acumulados = new Map<string, Acumulado>();

  for (const linea of lineas) {
    // El tronco NO sabe qué hace cada estrategia: le pide qué consumir y
    // acumula. Añadir V3 (presentaciones) o V1 (tiempo) es añadir un `case`
    // aquí y un archivo en `variantes/`, sin tocar la acumulación ni la guarda
    // de unidades, que es donde vive el riesgo.
    for (const consumo of planear(linea)) {
      agregar(
        acumulados,
        linea,
        consumo.insumoId,
        consumo.cantidad,
        unidadBase(consumo.unidadBase),
      );
    }
  }

  return [...acumulados.values()].map((item) => ({
    organizacionId: item.contexto.organizacionId,
    almacenId: item.contexto.almacenId,
    insumoId: item.insumoId,
    tipo: 'salida_venta',
    cantidad: cantidadATexto(item.cantidad),
    unidad: item.unidad,
    permiteNegativo: item.permiteNegativo,
    referenciaTipo: 'orden',
    referenciaId: item.contexto.ordenId,
    ...(item.contexto.empleadoId === undefined ? {} : { empleadoId: item.contexto.empleadoId }),
    idempotencyKey: `inventario:${item.contexto.ordenId}:${item.insumoId}`,
    origenes: item.origenes,
  }));
}

/**
 * Despacha a la variante que la línea declara.
 *
 * Es lo único del tronco que conoce los nombres de las estrategias, y es una
 * tabla de cinco renglones a propósito: si esto creciera con lógica de negocio
 * dentro, la extracción se habría deshecho sola.
 */
function planear(linea: LineaParaConsumo): readonly ConsumoDeInsumo[] {
  switch (linea.estrategiaConsumo) {
    case 'ninguno':
      return [];
    case 'sku':
      return consumoDeSku(
        linea.insumoId,
        linea.unidadVenta,
        linea.unidadBase,
        positiva(linea.cantidad),
      );
    case 'receta':
      return consumoDeReceta(linea.receta, positiva(linea.cantidad));
    case 'insumo_base':
      return consumoDeInsumoBase(linea.insumoId, linea.unidadBase, linea.captura);
  }
}

function unidadBase(texto: string): UnidadInventario {
  const unidad = normalizarUnidad(texto);
  if (unidad === 'caja' || unidad === 'paquete') {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'La unidad base de un insumo debe ser una medida o pieza.',
    );
  }
  return unidad;
}

function agregar(
  acumulados: Map<string, Acumulado>,
  linea: ContextoLinea,
  insumoId: string,
  valor: Cantidad,
  unidad: UnidadInventario,
): void {
  const clave = `${linea.organizacionId}\u0000${linea.almacenId}\u0000${linea.ordenId}\u0000${insumoId}`;
  const actual = acumulados.get(clave);
  if (actual === undefined) {
    acumulados.set(clave, {
      contexto: linea,
      insumoId,
      unidad,
      cantidad: valor,
      permiteNegativo: linea.permiteVentaSinStock,
      origenes: [linea.lineaId],
    });
    return;
  }
  if (actual.unidad !== unidad) {
    throw new ErrorDominio(
      'UNIDAD_INCOMPATIBLE',
      'El mismo insumo no puede consumirse con dos unidades base distintas.',
    );
  }
  actual.cantidad = desdeDiezmilesimas(actual.cantidad + valor);
  actual.permiteNegativo = actual.permiteNegativo && linea.permiteVentaSinStock;
  actual.origenes.push(linea.lineaId);
}

function verificarUnSoloContexto(lineas: readonly LineaParaConsumo[]): void {
  const primera = lineas[0];
  if (primera === undefined) return;
  for (const linea of lineas.slice(1)) {
    if (
      linea.organizacionId !== primera.organizacionId ||
      linea.almacenId !== primera.almacenId ||
      linea.ordenId !== primera.ordenId ||
      linea.empleadoId !== primera.empleadoId
    ) {
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Cada cálculo de consumo pertenece a una sola orden, almacén y organización.',
      );
    }
  }
}
