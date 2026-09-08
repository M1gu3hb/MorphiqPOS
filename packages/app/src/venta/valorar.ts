import { ErrorDominio } from '@morphiqpos/contracts';
import { centavos, type Centavos } from '@morphiqpos/domain/dinero';
import {
  precioDeLinea,
  type CapturaCantidad,
  type PrecioLinea,
  type ProductoParaPrecio,
  type Unidad,
} from '@morphiqpos/domain/catalogo';
import type { repoVentaCatalogo } from '@morphiqpos/data';

import { porCantidad } from './escala.ts';

/**
 * De una fila de `productos` al contrato de precio del dominio.
 *
 * Es la única traducción entre lo que guarda la base —columnas planas, con
 * nulos, `numeric` como cadena— y la unión discriminada que `precioDeLinea`
 * exige. Tenerla en un solo sitio es lo que evita que cada comando arme el
 * objeto a su manera y que dos de ellos calculen distinto el mismo producto
 * (señal 4 de `04-ARQUITECTURA §9`).
 */

type FilaProducto = repoVentaCatalogo.ProductoParaVender;

export interface LineaValorada {
  readonly precio: PrecioLinea;
  readonly costoTotalCentavos: Centavos;
  readonly unidad: string;
  readonly cantidad: string;
}

/**
 * Valora una línea: precio unitario, subtotal y costo.
 *
 * El costo se multiplica por la cantidad con enteros escalados a diezmilésimas,
 * que es la escala de `numeric(14,4)`. Pasar por `Number` aquí metería punto
 * flotante en el costo, y el margen de un producto de 0.001 kg saldría mal.
 */
export function valorarLinea(
  producto: FilaProducto,
  cantidad: string,
  unidad: string | undefined,
): LineaValorada {
  const captura: CapturaCantidad = {
    cantidad,
    unidad: unidad ?? unidadPorOmision(producto),
  };

  const precio = precioDeLinea(aContratoDePrecio(producto), captura);

  return {
    precio,
    costoTotalCentavos: porCantidad(producto.costoUnitarioCentavos, cantidad),
    unidad: captura.unidad,
    cantidad,
  };
}

function unidadPorOmision(producto: FilaProducto): string {
  if (producto.tipoVenta === 'variable_medida') return producto.unidadVariable ?? 'kg';
  if (producto.tipoVenta === 'porcion_contenedor') return 'ml';
  return producto.unidadVenta;
}

function aContratoDePrecio(p: FilaProducto): ProductoParaPrecio {
  const mayoreo =
    p.precioMayoreoCentavos !== null && p.cantidadMinimaMayoreo !== null
      ? { minimo: p.cantidadMinimaMayoreo, precioCentavos: centavos(p.precioMayoreoCentavos) }
      : undefined;

  if (p.tipoVenta === 'variable_medida') {
    if (p.unidadVariable === null || p.precioPorUnidadVariableCentavos === null) {
      // El `check` producto_variable_completo lo impide en la base; si llega
      // aquí, la fila entró por otro camino y vender a cero sería peor.
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        `"${p.nombre}" se vende por medida y no tiene precio por unidad.`,
        { productoId: p.id },
      );
    }
    return {
      tipoVenta: 'variable_medida',
      precioCentavos: centavos(p.precioPorUnidadVariableCentavos),
      unidadVariable: p.unidadVariable as 'kg' | 'g' | 'l' | 'ml' | 'm',
      ...(p.cantidadMinimaVariable === null ? {} : { minimo: p.cantidadMinimaVariable }),
      ...(p.cantidadMaximaVariable === null ? {} : { maximo: p.cantidadMaximaVariable }),
      ...(p.incrementoVariable === null ? {} : { incremento: p.incrementoVariable }),
      ...(mayoreo === undefined ? {} : { mayoreo }),
    };
  }

  if (p.tipoVenta === 'porcion_contenedor') {
    if (p.capacidadContenedorMl === null || p.precioPorPorcionCentavos === null) {
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        `"${p.nombre}" se vende por porción y le falta capacidad o precio.`,
        { productoId: p.id },
      );
    }
    return {
      tipoVenta: 'porcion_contenedor',
      precioCentavos: centavos(p.precioPorPorcionCentavos),
      capacidadMl: p.capacidadContenedorMl,
      ...(p.mlPorPorcion === null ? {} : { mlPorPorcion: p.mlPorPorcion }),
      ...(p.porcionesPorContenedor === null
        ? {}
        : { porcionesPorContenedor: p.porcionesPorContenedor }),
      ...(mayoreo === undefined ? {} : { mayoreo }),
    };
  }

  return {
    tipoVenta: p.tipoVenta === 'servicio' ? 'servicio' : 'precio_fijo',
    precioCentavos: centavos(p.precioVentaCentavos),
    unidadVenta: p.unidadVenta as Unidad,
    ...(mayoreo === undefined ? {} : { mayoreo }),
  };
}
