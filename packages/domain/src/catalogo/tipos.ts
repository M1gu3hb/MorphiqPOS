import { ErrorDominio } from '@morphiqpos/contracts/errores';

import type { Centavos } from '../dinero/index.ts';
import type { Unidad } from './unidades.ts';

export const TIPOS_VENTA = [
  'precio_fijo',
  'variable_medida',
  'porcion_contenedor',
  'servicio',
] as const;
export type TipoVenta = (typeof TIPOS_VENTA)[number];

interface PrecioBase {
  readonly precioCentavos: Centavos;
  readonly mayoreo?: { readonly minimo: string; readonly precioCentavos: Centavos };
}

/** Configuración cargada del catálogo por el servidor; nunca del request de venta. */
export type ProductoParaPrecio = PrecioBase &
  (
    | { readonly tipoVenta: 'precio_fijo' | 'servicio'; readonly unidadVenta: Unidad }
    | {
        readonly tipoVenta: 'variable_medida';
        readonly unidadVariable: 'kg' | 'g' | 'l' | 'ml' | 'm';
        readonly minimo?: string;
        readonly maximo?: string;
        readonly incremento?: string;
      }
    | {
        readonly tipoVenta: 'porcion_contenedor';
        readonly capacidadMl: string;
        readonly mlPorPorcion?: string;
        readonly porcionesPorContenedor?: string;
      }
  );

/** La captura sólo contiene cantidad y unidad; no tiene campos monetarios. */
export interface CapturaCantidad {
  readonly cantidad: string;
  readonly unidad: string;
}
export interface PrecioLinea {
  readonly subtotalCentavos: Centavos;
  readonly precioUnitarioCentavos: Centavos;
  readonly esMayoreo: boolean;
}

export function resolverTipoVenta(valor: unknown): TipoVenta {
  for (const tipo of TIPOS_VENTA) if (valor === tipo) return tipo;
  throw new ErrorDominio('CATALOGO_INVALIDO', 'El tipo de venta no está definido.');
}
