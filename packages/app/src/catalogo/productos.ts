import { PAQUETES, ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import {
  calcularMlPorPorcion,
  cantidad,
  cantidadATexto,
  normalizarUnidad,
} from '@morphiqpos/domain/catalogo';
import { desdeTexto } from '@morphiqpos/domain/dinero';
import { z } from 'zod';

import { definirComando } from '../comando';
import {
  entradaActualizarProducto,
  entradaArchivarProducto,
  entradaAsignarCodigo,
  entradaCambiarPrecio,
  entradaCrearProducto,
} from './esquemas';

export { entradaCrearProducto } from './esquemas';

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

export const crearProducto = definirComando<
  Transaccion,
  typeof entradaCrearProducto,
  { readonly id: string }
>({
  nombre: 'catalogo.crear_producto',
  entidad: 'producto',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaCrearProducto,
  async ejecutar(ctx, entrada) {
    const fila = await ctx.paso('insertar_producto', () =>
      ctx.tx
        .insertInto('productos')
        .values(valoresProducto(ctx.ambito.organizacionId, entrada))
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    if (entrada.estrategiaConsumo === 'sku') {
      await ctx.paso('crear_insumo_espejo', () =>
        ctx.tx
          .insertInto('insumos')
          .values({
            organizacion_id: ctx.ambito.organizacionId,
            categoria_id: entrada.categoriaId ?? null,
            producto_id: fila.id,
            nombre: entrada.nombre,
            unidad_base: normalizarUnidad(entrada.unidadVenta),
            costo_unitario_centavos: desdeTexto(entrada.costoUnitario),
            stock_minimo: cantidadATexto(cantidad(entrada.stockMinimo)),
          })
          .execute(),
      );
    }

    ctx.auditar({
      entidadId: fila.id,
      payload: { nombre: entrada.nombre, estrategiaConsumo: entrada.estrategiaConsumo },
    });
    return { id: fila.id };
  },
});

export const actualizarProducto = definirComando<
  Transaccion,
  typeof entradaActualizarProducto,
  { readonly id: string }
>({
  nombre: 'catalogo.actualizar_producto',
  entidad: 'producto',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaActualizarProducto,
  async ejecutar(ctx, entrada) {
    const fila = await ctx.paso('actualizar_producto', () =>
      ctx.tx
        .updateTable('productos')
        .set({
          nombre: entrada.nombre,
          descripcion: entrada.descripcion,
          imagen_url: entrada.imagenUrl,
          categoria_id: entrada.categoriaId,
          marca: entrada.marca,
          visible_en_pos: entrada.visibleEnPos,
          permite_venta_sin_stock: entrada.permiteVentaSinStock,
          stock_minimo: cantidadATexto(cantidad(entrada.stockMinimo)),
          updated_at: ctx.ahora,
        })
        .where('id', '=', entrada.productoId)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .returning('id')
        .executeTakeFirst(),
    );
    const id = exigirProducto(fila);
    ctx.auditar({ entidadId: id, payload: { nombre: entrada.nombre } });
    return { id };
  },
});

export const cambiarPrecioProducto = definirComando<
  Transaccion,
  typeof entradaCambiarPrecio,
  { readonly id: string }
>({
  nombre: 'catalogo.cambiar_precio',
  entidad: 'producto',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaCambiarPrecio,
  async ejecutar(ctx, entrada) {
    const costo = desdeTexto(entrada.costoUnitario);
    const fila = await ctx.paso('actualizar_precios', () =>
      ctx.tx
        .updateTable('productos')
        .set({
          precio_venta_centavos: desdeTexto(entrada.precioVenta),
          costo_unitario_centavos: costo,
          precio_mayoreo_centavos:
            entrada.precioMayoreo === null ? null : desdeTexto(entrada.precioMayoreo),
          cantidad_minima_mayoreo:
            entrada.cantidadMinimaMayoreo === null
              ? null
              : cantidadATexto(cantidad(entrada.cantidadMinimaMayoreo)),
          ...(entrada.precioVariable === undefined
            ? {}
            : { precio_por_unidad_variable_centavos: desdeTexto(entrada.precioVariable) }),
          ...(entrada.precioPorcion === undefined
            ? {}
            : { precio_por_porcion_centavos: desdeTexto(entrada.precioPorcion) }),
          updated_at: ctx.ahora,
        })
        .where('id', '=', entrada.productoId)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .returning('id')
        .executeTakeFirst(),
    );
    const id = exigirProducto(fila);
    await ctx.paso('sincronizar_costo_insumo', () =>
      ctx.tx
        .updateTable('insumos')
        .set({ costo_unitario_centavos: costo, updated_at: ctx.ahora })
        .where('producto_id', '=', id)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .execute(),
    );
    ctx.auditar({ entidadId: id, payload: { precioActualizado: true } });
    return { id };
  },
});

export const asignarCodigoBarras = definirComando<
  Transaccion,
  typeof entradaAsignarCodigo,
  { readonly id: string }
>({
  nombre: 'catalogo.asignar_codigo',
  entidad: 'producto',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaAsignarCodigo,
  async ejecutar(ctx, entrada) {
    const fila = await ctx.paso('asignar_codigo', () =>
      ctx.tx
        .updateTable('productos')
        .set({ codigo_barras: entrada.codigoBarras, sku: entrada.sku, updated_at: ctx.ahora })
        .where('id', '=', entrada.productoId)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .returning('id')
        .executeTakeFirst(),
    );
    const id = exigirProducto(fila);
    ctx.auditar({ entidadId: id, payload: { codigoActualizado: true } });
    return { id };
  },
});

export const archivarProducto = definirComando<
  Transaccion,
  typeof entradaArchivarProducto,
  { readonly id: string }
>({
  nombre: 'catalogo.archivar_producto',
  entidad: 'producto',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaArchivarProducto,
  async ejecutar(ctx, entrada) {
    const fila = await ctx.paso('archivar_producto', () =>
      ctx.tx
        .updateTable('productos')
        .set({ activo: false, visible_en_pos: false, updated_at: ctx.ahora })
        .where('id', '=', entrada.productoId)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .returning('id')
        .executeTakeFirst(),
    );
    const id = exigirProducto(fila);
    await ctx.paso('archivar_insumo_espejo', () =>
      ctx.tx
        .updateTable('insumos')
        .set({ activo: false, updated_at: ctx.ahora })
        .where('producto_id', '=', id)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .execute(),
    );
    ctx.auditar({ entidadId: id, payload: { archivado: true } });
    return { id };
  },
});

function valoresProducto(organizacionId: string, entrada: z.output<typeof entradaCrearProducto>) {
  let mlPorPorcion: string | null = null;
  if (entrada.tipoVenta === 'porcion_contenedor') {
    const capacidadMl = entrada.capacidadMl;
    if (capacidadMl === undefined) {
      throw new ErrorDominio('CATALOGO_INVALIDO', 'Falta la capacidad del contenedor.');
    }
    mlPorPorcion = cantidadATexto(
      calcularMlPorPorcion({
        capacidadMl,
        ...(entrada.mlPorPorcion === undefined ? {} : { mlPorPorcion: entrada.mlPorPorcion }),
        ...(entrada.porcionesPorContenedor === undefined
          ? {}
          : { porcionesPorContenedor: entrada.porcionesPorContenedor }),
      }),
    );
  }
  return {
    organizacion_id: organizacionId,
    categoria_id: entrada.categoriaId ?? null,
    nombre: entrada.nombre,
    descripcion: entrada.descripcion ?? null,
    imagen_url: entrada.imagenUrl ?? null,
    sku: entrada.sku ?? null,
    codigo_barras: entrada.codigoBarras ?? null,
    marca: entrada.marca ?? null,
    precio_venta_centavos: desdeTexto(entrada.precioVenta),
    costo_unitario_centavos: desdeTexto(entrada.costoUnitario),
    precio_mayoreo_centavos:
      entrada.precioMayoreo === undefined ? null : desdeTexto(entrada.precioMayoreo),
    cantidad_minima_mayoreo:
      entrada.cantidadMinimaMayoreo === undefined
        ? null
        : cantidadATexto(cantidad(entrada.cantidadMinimaMayoreo)),
    tipo_venta: entrada.tipoVenta,
    unidad_venta: normalizarUnidad(entrada.unidadVenta),
    unidad_variable: entrada.unidadVariable ?? null,
    precio_por_unidad_variable_centavos:
      entrada.precioVariable === undefined ? null : desdeTexto(entrada.precioVariable),
    cantidad_minima_variable: normalizarCantidad(entrada.cantidadMinimaVariable),
    cantidad_maxima_variable: normalizarCantidad(entrada.cantidadMaximaVariable),
    incremento_variable: normalizarCantidad(entrada.incrementoVariable),
    capacidad_contenedor_ml: normalizarCantidad(entrada.capacidadMl),
    porciones_por_contenedor: normalizarCantidad(entrada.porcionesPorContenedor),
    ml_por_porcion: mlPorPorcion,
    nombre_porcion: entrada.nombrePorcion ?? null,
    precio_por_porcion_centavos:
      entrada.precioPorcion === undefined ? null : desdeTexto(entrada.precioPorcion),
    estrategia_consumo: entrada.estrategiaConsumo,
    insumo_base_id: entrada.insumoBaseId ?? null,
    permite_venta_sin_stock: entrada.permiteVentaSinStock,
    stock_minimo: cantidadATexto(cantidad(entrada.stockMinimo)),
    visible_en_pos: entrada.visibleEnPos,
  };
}

function normalizarCantidad(valor?: string): string | null {
  return valor === undefined ? null : cantidadATexto(cantidad(valor));
}

function exigirProducto(fila: { readonly id: string } | undefined): string {
  if (fila === undefined) {
    throw new ErrorDominio('CATALOGO_INVALIDO', 'El producto no existe.');
  }
  return fila.id;
}
