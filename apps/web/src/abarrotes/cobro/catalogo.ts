import { centavosDe } from '~/cliente/dinero-del-puente';

import type { Catalogo } from './escaneo.ts';
import {
  conGranel,
  conPresentacion,
  conProducto,
  diezmilesimas,
  textoDeDiezmilesimas,
  type LineaDeVenta,
  type PresentacionDeCobro,
  type ProductoDeCobro,
} from './lineas.ts';

/** Lo que el cobro lee de `ProductoTerminado`. */
export interface ProductoDelPuente {
  readonly id: string;
  readonly nombre: string | null;
  readonly precio_venta: number | null;
  readonly codigo_barras: string | null;
  readonly existencia?: number | null;
  readonly tipo_venta?: string | null;
  readonly unidad_variable?: string | null;
  readonly precio_por_unidad_variable?: number | null;
}

/** Lo que el cobro lee de `Presentacion`. */
export interface PresentacionDelPuente {
  readonly id: string;
  readonly producto_id: string;
  readonly nombre: string;
  readonly factor: number | string;
  readonly codigo_barras: string | null;
  readonly precio_venta_centavos: number | null;
  readonly activa?: boolean | null;
}

/** La cantidad del puente como texto de hasta cuatro decimales, sin notación científica. */
function factorEnTexto(factor: number | string): string {
  const texto = typeof factor === 'number' ? factor.toFixed(4) : factor.trim();
  return textoDeDiezmilesimas(diezmilesimas(texto));
}

/**
 * Un producto del puente, ya en centavos. El que se vende por medida tiene su precio en
 * `precio_por_unidad_variable` —el kilo— y NO en `precio_venta`: es el que el servidor cobra.
 */
export function productoDeCobro(fila: ProductoDelPuente): ProductoDeCobro {
  const porMedida = fila.tipo_venta === 'variable_medida';
  const precio = porMedida
    ? centavosDe(
        'ProductoTerminado',
        'precio_por_unidad_variable',
        fila.precio_por_unidad_variable ?? null,
      )
    : centavosDe('ProductoTerminado', 'precio_venta', fila.precio_venta);
  return {
    id: fila.id,
    nombre: fila.nombre ?? 'Producto',
    codigoBarras: fila.codigo_barras,
    // Sin precio cuenta como cero, como siempre: la línea entra y el total no miente.
    precioCentavos: precio ?? 0,
    unidadDeMedida: porMedida ? (fila.unidad_variable ?? 'kg') : null,
    existencia: typeof fila.existencia === 'number' ? fila.existencia : null,
  };
}

export function presentacionDeCobro(fila: PresentacionDelPuente): PresentacionDeCobro {
  return {
    id: fila.id,
    productoId: fila.producto_id,
    nombre: fila.nombre,
    factor: factorEnTexto(fila.factor),
    codigoBarras: fila.codigo_barras,
    precioCentavos: centavosDe('Presentacion', 'precio_venta_centavos', fila.precio_venta_centavos),
  };
}

export function armarCatalogo(
  productos: readonly ProductoDeCobro[],
  presentaciones: readonly PresentacionDeCobro[],
): Catalogo {
  const porCodigo = new Map<string, ProductoDeCobro>();
  const porId = new Map<string, ProductoDeCobro>();
  for (const producto of productos) {
    porId.set(producto.id, producto);
    if (producto.codigoBarras !== null) porCodigo.set(producto.codigoBarras, producto);
  }
  const presentacionesPorCodigo = new Map<string, PresentacionDeCobro>();
  for (const presentacion of presentaciones) {
    if (presentacion.codigoBarras !== null && porId.has(presentacion.productoId)) {
      presentacionesPorCodigo.set(presentacion.codigoBarras, presentacion);
    }
  }
  return { porCodigo, porId, presentacionesPorCodigo };
}

/** Lo que devuelve `venta.retomar`: los renglones de la venta apartada. */
export interface RenglonRetomado {
  readonly productoId: string | null;
  readonly nombre: string;
  readonly cantidad: string;
  readonly codigoBarras: string | null;
  readonly cantidadBaseConsumo: string | null;
}

/**
 * La venta apartada, de vuelta en la pantalla (F6). Cada renglón vuelve a ser lo que era: la
 * caja vuelve como caja —por su código—, la pesada como pesada y la pieza con sus piezas.
 * Lo que ya no está en el catálogo se cuenta aparte: la pantalla lo dice en vez de cobrarlo
 * a un precio que ya no existe.
 */
export function lineasDeRetomada(
  renglones: readonly RenglonRetomado[],
  catalogo: Catalogo,
): { readonly lineas: readonly LineaDeVenta[]; readonly perdidos: readonly string[] } {
  let lineas: readonly LineaDeVenta[] = [];
  const perdidos: string[] = [];
  for (const renglon of renglones) {
    const producto =
      renglon.productoId === null ? undefined : catalogo.porId.get(renglon.productoId);
    if (producto === undefined) {
      perdidos.push(renglon.nombre);
      continue;
    }
    const cantidad = textoDeDiezmilesimas(diezmilesimas(renglon.cantidad));
    const piezas = Number(diezmilesimas(cantidad) / 10_000n);
    if (renglon.cantidadBaseConsumo !== null) {
      const presentacion =
        renglon.codigoBarras === null
          ? undefined
          : catalogo.presentacionesPorCodigo.get(renglon.codigoBarras);
      if (presentacion === undefined) {
        perdidos.push(renglon.nombre);
        continue;
      }
      for (let n = 0; n < piezas; n += 1) lineas = conPresentacion(lineas, producto, presentacion);
      continue;
    }
    if (producto.unidadDeMedida !== null) {
      lineas = conGranel(lineas, producto, cantidad, producto.unidadDeMedida);
      continue;
    }
    for (let n = 0; n < piezas; n += 1) lineas = conProducto(lineas, producto);
  }
  return { lineas, perdidos };
}
