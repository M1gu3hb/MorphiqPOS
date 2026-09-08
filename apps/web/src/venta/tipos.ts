/**
 * Las formas que cruzan el puente HTTP.
 *
 * Se declaran aquí y no se importan de `@morphiqpos/app`: ese paquete lleva
 * `server-only` y arrastra `packages/data`, que `apps/web` tiene prohibido
 * importar (04-ARQUITECTURA §2, prohibición 1). La frontera es el JSON, y
 * escribir su forma dos veces es el precio de que la frontera exista de verdad.
 *
 * Todo importe es `string`: son centavos que no caben con seguridad en un
 * `number` de JavaScript.
 */

export interface LineaCotizada {
  readonly id: string;
  readonly productoId: string | null;
  readonly productoNombre: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly precioUnitarioCentavos: string;
  readonly subtotalCentavos: string;
  readonly esMayoreo: boolean;
}

export interface Cotizacion {
  readonly ordenId: string;
  readonly lineas: readonly LineaCotizada[];
  readonly subtotalCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly totalCentavos: string;
}

export interface EstadoVenta {
  readonly cotizacion: Cotizacion | null;
  readonly sesionCajaId: string | null;
}

export interface ProductoEnRejilla {
  readonly id: string;
  readonly nombre: string;
  readonly sku: string | null;
  readonly precioVentaCentavos: string;
  readonly tipoVenta: string;
  readonly unidadVenta: string;
  readonly categoriaNombre: string | null;
  readonly existencia: string | null;
}

export interface ResultadoCobro {
  readonly ordenId: string;
  readonly serie: string;
  readonly folio: string;
  readonly totalCentavos: string;
  readonly pagadoCentavos: string;
  readonly cambioCentavos: string;
}

export interface TicketImpreso {
  readonly serie: string;
  readonly folio: string | null;
  readonly emitidoEn: string;
  readonly organizacionNombre: string;
  readonly sucursalNombre: string;
  readonly lineas: readonly {
    readonly nombre: string;
    readonly cantidad: string;
    readonly unidad: string;
    readonly precioUnitarioCentavos: string;
    readonly importeCentavos: string;
  }[];
  readonly subtotalCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly totalCentavos: string;
  readonly pagos: readonly {
    readonly metodo: string;
    readonly montoCentavos: string;
    readonly recibidoCentavos: string | null;
    readonly cambioCentavos: string;
  }[];
}

export interface Empleado {
  readonly empleoId: string;
  readonly nombre: string;
  readonly rol: string;
}
