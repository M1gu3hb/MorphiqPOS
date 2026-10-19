import { ErrorDominio } from '@morphiqpos/contracts';
import { centavos, type Centavos } from '@morphiqpos/domain/dinero';

import { aDiezmilesimas, deDiezmilesimas, ESCALA_CANTIDAD, porCantidad } from './escala.ts';

/**
 * F-147 · Cuánto cuesta y cuánto descuenta una presentación vendida.
 *
 * Pura a propósito, como `repartirPagos`: es donde se decide el precio de la caja y cuántas
 * piezas salen del anaquel, y eso merece prueba y mutación sin base de datos.
 */

export interface PresentacionParaVender {
  readonly nombre: string;
  /** Cuántas unidades base trae. Texto: `'24'`, `'0.05'`. */
  readonly factor: string;
  /** Nulo: se deriva del factor, como en su alta. */
  readonly precioVentaCentavos: bigint | null;
}

export interface ProductoDeLaPresentacion {
  readonly nombre: string;
  readonly precioVentaCentavos: bigint;
  readonly costoUnitarioCentavos: bigint;
}

export interface PresentacionValorada {
  readonly nombre: string;
  /** La unidad de la línea es la presentación: «caja». `orden_lineas.unidad` es de diez. */
  readonly unidad: string;
  readonly precioUnitarioCentavos: Centavos;
  readonly subtotalCentavos: Centavos;
  /** El costo de UNA caja: el de la pieza por el factor. */
  readonly costoUnitarioCentavos: Centavos;
  /** Lo que sale del inventario, en unidad base: `factor × cantidad`. */
  readonly cantidadBaseConsumo: string;
}

const LARGO_UNIDAD = 10;
const ENTERA = /^\d{1,6}(\.0{1,4})?$/;

export function valorarPresentacion(
  producto: ProductoDeLaPresentacion,
  presentacion: PresentacionParaVender,
  cantidad: string,
): PresentacionValorada {
  // Media caja no se vende: la caja existe porque se vende entera.
  if (!ENTERA.test(cantidad) || aDiezmilesimas(cantidad) === 0n) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'Una presentación se vende por piezas enteras.');
  }
  const unitario =
    presentacion.precioVentaCentavos ??
    porCantidad(producto.precioVentaCentavos, presentacion.factor);
  return {
    nombre: `${producto.nombre} · ${presentacion.nombre}`,
    unidad: presentacion.nombre.slice(0, LARGO_UNIDAD),
    precioUnitarioCentavos: centavos(unitario),
    subtotalCentavos: porCantidad(unitario, cantidad),
    costoUnitarioCentavos: porCantidad(producto.costoUnitarioCentavos, presentacion.factor),
    cantidadBaseConsumo: deDiezmilesimas(
      (aDiezmilesimas(cantidad) * aDiezmilesimas(presentacion.factor)) / ESCALA_CANTIDAD,
    ),
  };
}

/**
 * Lo que el cobro descuenta de una línea: la cantidad vendida en su unidad, o —si la línea
 * es una presentación— su consumo YA en unidad base, sin conversión de por medio.
 */
export function cantidadAConsumir(
  linea: {
    readonly cantidad: string;
    readonly unidad: string;
    readonly cantidadBaseConsumo: string | null;
  },
  unidadBase: string,
): { readonly cantidad: string; readonly unidadVenta: string } {
  if (linea.cantidadBaseConsumo !== null) {
    return { cantidad: linea.cantidadBaseConsumo, unidadVenta: unidadBase };
  }
  return { cantidad: linea.cantidad, unidadVenta: linea.unidad };
}
