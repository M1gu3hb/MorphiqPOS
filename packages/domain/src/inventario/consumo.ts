import { ErrorDominio } from '@morphiqpos/contracts/errores';

import {
  calcularMlPorPorcion,
  cantidad,
  cantidadATexto,
  cantidadExacta,
  convertirUnidad,
  desdeDiezmilesimas,
  ESCALA_CANTIDAD,
  normalizarUnidad,
  type Cantidad,
  type Unidad,
} from '../catalogo/index';

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

export interface IngredienteReceta {
  readonly insumoId: string;
  /** Cantidad por cada unidad vendida. */
  readonly cantidad: string;
  readonly unidad: string;
  readonly unidadBase: string;
  /** 10 significa 10 %. */
  readonly mermaPorcentaje?: string;
}

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
      readonly captura:
        | {
            readonly tipoVenta: 'variable_medida';
            readonly cantidad: string;
            readonly unidad: string;
          }
        | {
            readonly tipoVenta: 'porcion_contenedor';
            readonly cantidadPorciones: string;
            readonly capacidadMl: string;
            readonly mlPorPorcion?: string;
            readonly porcionesPorContenedor?: string;
          };
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
    const cantidadLinea = positiva(linea.cantidad);
    switch (linea.estrategiaConsumo) {
      case 'ninguno':
        break;
      case 'sku':
        agregar(
          acumulados,
          linea,
          linea.insumoId,
          convertirUnidad(cantidadLinea, linea.unidadVenta, linea.unidadBase),
          unidadBase(linea.unidadBase),
        );
        break;
      case 'receta':
        for (const ingrediente of linea.receta) {
          const porProducto = convertirUnidad(
            positiva(ingrediente.cantidad),
            ingrediente.unidad,
            ingrediente.unidadBase,
          );
          const total = multiplicar(porProducto, cantidadLinea);
          agregar(
            acumulados,
            linea,
            ingrediente.insumoId,
            aplicarMerma(total, ingrediente.mermaPorcentaje),
            unidadBase(ingrediente.unidadBase),
          );
        }
        break;
      case 'insumo_base': {
        const consumo = consumoDeInsumoBase(linea.captura, linea.unidadBase);
        agregar(acumulados, linea, linea.insumoId, consumo, unidadBase(linea.unidadBase));
        break;
      }
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

function consumoDeInsumoBase(
  captura: Extract<LineaParaConsumo, { estrategiaConsumo: 'insumo_base' }>['captura'],
  destino: string,
): Cantidad {
  if (captura.tipoVenta === 'variable_medida') {
    return convertirUnidad(positiva(captura.cantidad), captura.unidad, destino);
  }
  const porciones = positiva(captura.cantidadPorciones);
  const mlPorPorcion = calcularMlPorPorcion(captura);
  return convertirUnidad(multiplicar(porciones, mlPorPorcion), 'ml', destino);
}

function aplicarMerma(valor: Cantidad, porcentaje?: string): Cantidad {
  if (porcentaje === undefined) return valor;
  const merma = cantidad(porcentaje);
  const cien = 100n * ESCALA_CANTIDAD;
  return cantidadExacta(valor * (cien + merma), cien);
}

function multiplicar(izquierda: Cantidad, derecha: Cantidad): Cantidad {
  return cantidadExacta(izquierda * derecha, ESCALA_CANTIDAD);
}

function positiva(texto: string): Cantidad {
  const valor = cantidad(texto);
  if (valor === 0n) {
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'El consumo debe ser mayor que cero.');
  }
  return valor;
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
