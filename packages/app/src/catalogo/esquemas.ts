import { z } from 'zod';

import { urlHttp } from '../validacion/url-http.ts';

const id = z.uuid();
const texto = z.string().trim().min(1).max(160);
const textoOpcional = z.string().trim().min(1).max(500).optional();
const importe = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/);
const cantidad = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,4})?$/);
const unidad = z.enum(['pieza', 'caja', 'paquete', 'kg', 'g', 'l', 'ml', 'm']);

export const entradaCrearProducto = z
  .object({
    nombre: texto,
    descripcion: textoOpcional,
    imagenUrl: urlHttp.optional(),
    categoriaId: id.optional(),
    marca: z.string().trim().min(1).max(100).optional(),
    sku: z.string().trim().min(1).max(80).optional(),
    codigoBarras: z.string().trim().min(6).max(80).optional(),
    precioVenta: importe,
    costoUnitario: importe,
    precioMayoreo: importe.optional(),
    cantidadMinimaMayoreo: cantidad.optional(),
    tipoVenta: z.enum(['precio_fijo', 'variable_medida', 'porcion_contenedor', 'servicio']),
    unidadVenta: unidad,
    unidadVariable: z.enum(['kg', 'g', 'l', 'ml', 'm']).optional(),
    precioVariable: importe.optional(),
    cantidadMinimaVariable: cantidad.optional(),
    cantidadMaximaVariable: cantidad.optional(),
    incrementoVariable: cantidad.optional(),
    capacidadMl: cantidad.optional(),
    porcionesPorContenedor: cantidad.optional(),
    mlPorPorcion: cantidad.optional(),
    nombrePorcion: z.string().trim().min(1).max(60).optional(),
    precioPorcion: importe.optional(),
    estrategiaConsumo: z.enum(['sku', 'receta', 'insumo_base', 'ninguno']),
    insumoBaseId: id.optional(),
    permiteVentaSinStock: z.boolean(),
    stockMinimo: cantidad,
    visibleEnPos: z.boolean(),
  })
  .superRefine((valor, ctx) => {
    const mayoreoCompleto =
      (valor.precioMayoreo === undefined) === (valor.cantidadMinimaMayoreo === undefined);
    if (!mayoreoCompleto) problema(ctx, 'precioMayoreo', 'Completa precio y mínimo de mayoreo.');

    if (valor.tipoVenta === 'servicio' && valor.estrategiaConsumo !== 'ninguno') {
      problema(ctx, 'estrategiaConsumo', 'Un servicio no descuenta inventario.');
    }
    if (
      valor.estrategiaConsumo === 'sku' &&
      (valor.unidadVenta === 'caja' || valor.unidadVenta === 'paquete')
    ) {
      problema(ctx, 'unidadVenta', 'Una caja o paquete necesita equivalencia antes de ser SKU.');
    }
    if (valor.estrategiaConsumo === 'insumo_base' && valor.insumoBaseId === undefined) {
      problema(ctx, 'insumoBaseId', 'Selecciona el insumo base.');
    }
    if (valor.tipoVenta === 'variable_medida') {
      if (valor.estrategiaConsumo !== 'insumo_base') {
        problema(ctx, 'estrategiaConsumo', 'Un producto variable descuenta su insumo base.');
      }
      if (valor.unidadVariable === undefined) problema(ctx, 'unidadVariable', 'Selecciona unidad.');
      if (valor.precioVariable === undefined) problema(ctx, 'precioVariable', 'Define el precio.');
    }
    if (valor.tipoVenta === 'porcion_contenedor') {
      if (valor.estrategiaConsumo !== 'insumo_base') {
        problema(ctx, 'estrategiaConsumo', 'Una porción descuenta su insumo base.');
      }
      if (valor.capacidadMl === undefined) problema(ctx, 'capacidadMl', 'Define la capacidad.');
      if (valor.precioPorcion === undefined) problema(ctx, 'precioPorcion', 'Define el precio.');
      if (valor.mlPorPorcion === undefined && valor.porcionesPorContenedor === undefined) {
        problema(ctx, 'mlPorPorcion', 'Define ml o porciones por contenedor.');
      }
    }
  });

export const entradaActualizarProducto = z.object({
  productoId: id,
  nombre: texto,
  descripcion: z.string().trim().max(500).nullable(),
  imagenUrl: urlHttp.nullable(),
  categoriaId: id.nullable(),
  marca: z.string().trim().min(1).max(100).nullable(),
  visibleEnPos: z.boolean(),
  permiteVentaSinStock: z.boolean(),
  stockMinimo: cantidad,
});

export const entradaCambiarPrecio = z
  .object({
    productoId: id,
    precioVenta: importe,
    costoUnitario: importe,
    precioMayoreo: importe.nullable(),
    cantidadMinimaMayoreo: cantidad.nullable(),
    precioVariable: importe.optional(),
    precioPorcion: importe.optional(),
  })
  .superRefine((valor, ctx) => {
    if ((valor.precioMayoreo === null) !== (valor.cantidadMinimaMayoreo === null)) {
      problema(ctx, 'precioMayoreo', 'Completa precio y mínimo de mayoreo.');
    }
  });

export const entradaAsignarCodigo = z.object({
  productoId: id,
  codigoBarras: z.string().trim().min(6).max(80).nullable(),
  sku: z.string().trim().min(1).max(80).nullable(),
});

export const entradaArchivarProducto = z.object({ productoId: id });

export const entradaCrearModificador = z.object({
  productoId: id,
  nombre: texto,
  obligatorio: z.boolean(),
  tipo: z.enum(['unica', 'multiple']),
  opciones: z
    .array(z.object({ nombre: texto, precioExtra: importe }))
    .min(1)
    .max(30),
});

function problema(ctx: z.RefinementCtx, campo: string, mensaje: string): void {
  ctx.addIssue({ code: 'custom', path: [campo], message: mensaje });
}
