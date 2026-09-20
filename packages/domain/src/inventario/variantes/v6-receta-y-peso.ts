import { ErrorDominio } from '@morphiqpos/contracts/errores';

import {
  calcularMlPorPorcion,
  cantidad,
  cantidadExacta,
  convertirUnidad,
  ESCALA_CANTIDAD,
  type Cantidad,
} from '../../catalogo/index.ts';
import type { ConsumoDeInsumo } from './tipos.ts';

/**
 * V6 · Peso, volumen y receta. La variante de restaurante, cafetería y bar.
 *
 * ── Qué cambió al extraerla, y qué NO ──────────────────────────────────────
 * **El comportamiento no cambió ni un centavo.** Estas funciones salieron tal
 * cual de `consumo.ts`; lo único nuevo es que ahora viven detrás de un contrato
 * y el tronco no las conoce por nombre.
 *
 * La prueba de que la extracción salió bien no es que compile: es que las
 * pruebas que ya pasaban sigan pasando **sin tocarlas**. Si hubiera hecho falta
 * editar una sola aserción, la refactorización habría cambiado conducta y no
 * sería una extracción.
 *
 * ── Las tres formas de consumir de V6 ──────────────────────────────────────
 *   · `sku`          el producto ES el insumo. Una cerveza de 355 ml.
 *   · `receta`       explota en ingredientes con su merma. Una arrachera.
 *   · `insumo_base`  se vende por medida o por porción de un contenedor.
 *                    Un kilo de queso, una copa de una botella.
 */

export interface IngredienteReceta {
  readonly insumoId: string;
  /** Cantidad por cada unidad vendida. */
  readonly cantidad: string;
  readonly unidad: string;
  readonly unidadBase: string;
  /** 10 significa 10 %. */
  readonly mermaPorcentaje?: string;
}

export type CapturaDeInsumoBase =
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

export function positiva(texto: string): Cantidad {
  const valor = cantidad(texto);
  if (valor === 0n) {
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'El consumo debe ser mayor que cero.');
  }
  return valor;
}

export function multiplicar(izquierda: Cantidad, derecha: Cantidad): Cantidad {
  return cantidadExacta(izquierda * derecha, ESCALA_CANTIDAD);
}

function aplicarMerma(valor: Cantidad, porcentaje?: string): Cantidad {
  if (porcentaje === undefined) return valor;
  const merma = cantidad(porcentaje);
  const cien = 100n * ESCALA_CANTIDAD;
  return cantidadExacta(valor * (cien + merma), cien);
}

/** `sku` · el producto es el insumo, convertido a su unidad base. */
export function consumoDeSku(
  insumoId: string,
  unidadVenta: string,
  unidadBase: string,
  cantidadLinea: Cantidad,
): readonly ConsumoDeInsumo[] {
  return [
    {
      insumoId,
      cantidad: convertirUnidad(cantidadLinea, unidadVenta, unidadBase),
      unidadBase,
    },
  ];
}

/** `receta` · explota en ingredientes, cada uno con su merma declarada. */
export function consumoDeReceta(
  receta: readonly IngredienteReceta[],
  cantidadLinea: Cantidad,
): readonly ConsumoDeInsumo[] {
  return receta.map((ingrediente) => {
    const porProducto = convertirUnidad(
      positiva(ingrediente.cantidad),
      ingrediente.unidad,
      ingrediente.unidadBase,
    );
    const total = multiplicar(porProducto, cantidadLinea);
    return {
      insumoId: ingrediente.insumoId,
      cantidad: aplicarMerma(total, ingrediente.mermaPorcentaje),
      unidadBase: ingrediente.unidadBase,
    };
  });
}

/** `insumo_base` · por medida directa, o por porciones de un contenedor. */
export function consumoDeInsumoBase(
  insumoId: string,
  unidadBase: string,
  captura: CapturaDeInsumoBase,
): readonly ConsumoDeInsumo[] {
  if (captura.tipoVenta === 'variable_medida') {
    return [
      {
        insumoId,
        cantidad: convertirUnidad(positiva(captura.cantidad), captura.unidad, unidadBase),
        unidadBase,
      },
    ];
  }
  const porciones = positiva(captura.cantidadPorciones);
  const mlPorPorcion = calcularMlPorPorcion(captura);
  return [
    {
      insumoId,
      cantidad: convertirUnidad(multiplicar(porciones, mlPorPorcion), 'ml', unidadBase),
      unidadBase,
    },
  ];
}
