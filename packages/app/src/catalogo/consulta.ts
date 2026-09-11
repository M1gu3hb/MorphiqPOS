import type { Rol } from '@morphiqpos/contracts';
import { repoCatalogo, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

const ROLES_CON_COSTO: readonly Rol[] = ['dueno', 'administrador', 'gerente', 'almacen'];

export const entradaBuscarProductos = z.object({
  busqueda: z.string().trim().max(100).optional(),
  categoriaId: z.uuid().optional(),
  cursor: z
    .object({ updatedAt: z.iso.datetime().transform((valor) => new Date(valor)), id: z.uuid() })
    .optional(),
  limite: z.number().int().min(1).max(50).default(24),
});

export interface ProductoResumen {
  readonly id: string;
  readonly categoriaId: string | null;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly imagenUrl: string | null;
  readonly sku: string | null;
  readonly codigoBarras: string | null;
  readonly marca: string | null;
  readonly precioVentaCentavos: string;
  readonly costoUnitarioCentavos?: string;
  readonly precioMayoreoCentavos: string | null;
  readonly cantidadMinimaMayoreo: string | null;
  readonly tipoVenta: string;
  readonly unidadVenta: string;
  readonly permiteVentaSinStock: boolean;
  readonly stockMinimo: string;
  readonly visibleEnPos: boolean;
  readonly categoriaNombre: string | null;
  readonly updatedAt: string;
}

export interface PaginaProductos {
  readonly productos: readonly ProductoResumen[];
  readonly siguienteCursor: { readonly updatedAt: string; readonly id: string } | null;
}

/** Cruza la frontera HTTP sin bigint ni Date implícitos. */
export async function listarProductos(
  tx: Transaccion,
  organizacionId: string,
  entrada: z.output<typeof entradaBuscarProductos>,
  rol: Rol,
): Promise<PaginaProductos> {
  const resultado = await repoCatalogo.buscarProductos(tx, organizacionId, {
    limite: entrada.limite,
    ...(entrada.busqueda === undefined ? {} : { busqueda: entrada.busqueda }),
    ...(entrada.categoriaId === undefined ? {} : { categoriaId: entrada.categoriaId }),
    ...(entrada.cursor === undefined ? {} : { cursor: entrada.cursor }),
  });
  return {
    productos: resultado.productos.map((producto) => ({
      id: producto.id,
      categoriaId: producto.categoria_id,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      imagenUrl: producto.imagen_url,
      sku: producto.sku,
      codigoBarras: producto.codigo_barras,
      marca: producto.marca,
      precioVentaCentavos: producto.precio_venta_centavos.toString(),
      ...(ROLES_CON_COSTO.includes(rol)
        ? { costoUnitarioCentavos: producto.costo_unitario_centavos.toString() }
        : {}),
      precioMayoreoCentavos: producto.precio_mayoreo_centavos?.toString() ?? null,
      cantidadMinimaMayoreo: producto.cantidad_minima_mayoreo,
      tipoVenta: producto.tipo_venta,
      unidadVenta: producto.unidad_venta,
      permiteVentaSinStock: producto.permite_venta_sin_stock,
      stockMinimo: producto.stock_minimo,
      visibleEnPos: producto.visible_en_pos,
      categoriaNombre: producto.categoria_nombre,
      updatedAt: producto.updated_at.toISOString(),
    })),
    siguienteCursor:
      resultado.siguienteCursor === null
        ? null
        : {
            updatedAt: resultado.siguienteCursor.updatedAt.toISOString(),
            id: resultado.siguienteCursor.id,
          },
  };
}
