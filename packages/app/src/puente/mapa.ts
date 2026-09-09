import 'server-only';

import { CAMPOS_AUTOMATICOS, type CampoMapeado, type MapaEntidad } from './tipos.ts';

/**
 * LA TABLA DE TRADUCCIÓN (F1-02 §3).
 *
 * Un solo archivo, entidad por entidad y campo por campo. Aquí es donde el
 * nombre que él escribió en 2026 se convierte en la columna que existe hoy.
 *
 * ── Por qué así y no renombrando las tablas ────────────────────────────────
 * Renombrar `ordenes` a `ventas` obligaría a reescribir el backend ya hecho y
 * mataría el modelo genérico que la Fase 2 necesita para citas y comercio
 * electrónico. El puente cuesta este archivo y sus pruebas.
 *
 * ── Lo que este archivo NO mapea ───────────────────────────────────────────
 * Cuatro entidades no son una tabla con columnas y viven en `especiales.ts`:
 * `ConfiguracionNegocio` (un documento JSON), `UsuarioPOS` (tres tablas),
 * `DescuentoInventarioVenta` (una vista) y `UnidadMedida` (constantes suyas).
 */

const AUTO = CAMPOS_AUTOMATICOS;

/**
 * Un subconjunto de los campos automáticos.
 *
 * `movimientos_stock` es un ledger INMUTABLE: no tiene `updated_at` porque una
 * fila jamás se toca después de escribirla.
 */
function soloAutomaticos(claves: readonly string[]): Record<string, CampoMapeado> {
  const salida: Record<string, CampoMapeado> = {};
  for (const clave of claves) {
    const campo = AUTO[clave];
    if (campo !== undefined) salida[clave] = campo;
  }
  return salida;
}

export const MAPA: Readonly<Record<string, MapaEntidad>> = {
  // ── Catálogo ─────────────────────────────────────────────────────────────
  ProductoTerminado: {
    tabla: 'productos',
    escritura: 'directa',
    ordenPorOmision: 'nombre',
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto', publico: true },
      descripcion: { columna: 'descripcion', conversion: 'texto', publico: true },
      categoria_id: { columna: 'categoria_id', conversion: 'texto', publico: true },
      imagen_url: { columna: 'imagen_url', conversion: 'texto', publico: true },
      sku: { columna: 'sku', conversion: 'texto' },
      codigo_barras: { columna: 'codigo_barras', conversion: 'texto' },
      precio_venta: { columna: 'precio_venta_centavos', conversion: 'dinero', publico: true },
      // El costo lo recalcula la receta en cascada (E4-4). Aceptarlo del
      // cliente dejaría márgenes inventados en toda la aplicación.
      costo_calculado_actual: {
        columna: 'costo_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      utilidad_unitaria: {
        columna: 'utilidad_unitaria_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      margen_porcentaje: { columna: 'margen_bp', conversion: 'puntos_base', escribible: false },
      tipo_venta: { columna: 'tipo_venta', conversion: 'texto', publico: true },
      unidad_venta: { columna: 'unidad_venta', conversion: 'texto', publico: true },
      unidad_variable: { columna: 'unidad_variable', conversion: 'texto', publico: true },
      precio_por_unidad_variable: {
        columna: 'precio_por_unidad_variable_centavos',
        conversion: 'dinero',
        publico: true,
      },
      cantidad_minima_variable: { columna: 'cantidad_minima_variable', conversion: 'decimal' },
      cantidad_maxima_variable: { columna: 'cantidad_maxima_variable', conversion: 'decimal' },
      incremento_variable: { columna: 'incremento_variable', conversion: 'decimal' },
      capacidad_contenedor_ml: { columna: 'capacidad_contenedor_ml', conversion: 'decimal' },
      porciones_por_contenedor: { columna: 'porciones_por_contenedor', conversion: 'decimal' },
      ml_por_porcion: { columna: 'ml_por_porcion', conversion: 'decimal' },
      nombre_porcion: { columna: 'nombre_porcion', conversion: 'texto', publico: true },
      precio_por_porcion: {
        columna: 'precio_por_porcion_centavos',
        conversion: 'dinero',
        publico: true,
      },
      estrategia_consumo: { columna: 'estrategia_consumo', conversion: 'texto' },
      permite_venta_sin_stock: { columna: 'permite_venta_sin_stock', conversion: 'booleano' },
      stock_minimo: { columna: 'stock_minimo', conversion: 'decimal' },
      visible_en_pos: { columna: 'visible_en_pos', conversion: 'booleano', publico: true },
      // Borrado suave: los registros históricos guardan el nombre en instantánea,
      // así que un producto nunca desaparece de verdad (F1-01 §3, regla 8).
      activo: { columna: 'activo', conversion: 'booleano' },
      insumo_base_id: { columna: 'insumo_base_id', conversion: 'texto' },
    },
  },

  CategoriaProducto: {
    tabla: 'categorias',
    escritura: 'directa',
    ordenPorOmision: 'orden',
    // `categorias` guarda las de producto y las de insumo en la misma tabla.
    filtroFijo: { tipo: 'producto' },
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto', publico: true },
      color: { columna: 'color', conversion: 'texto', publico: true },
      icono: { columna: 'icono', conversion: 'texto', publico: true },
      orden: { columna: 'orden', conversion: 'entero', publico: true },
      activo: { columna: 'activa', conversion: 'booleano' },
    },
  },

  /**
   * Las categorías de INSUMO. Misma tabla que las de producto, distinguidas
   * por `tipo`. Su código la usa una sola vez, en Inventario, y por eso
   * estuvo a punto de quedarse fuera del puente.
   */
  CategoriaIngrediente: {
    tabla: 'categorias',
    escritura: 'directa',
    ordenPorOmision: 'orden',
    filtroFijo: { tipo: 'insumo' },
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto' },
      color: { columna: 'color', conversion: 'texto' },
      icono: { columna: 'icono', conversion: 'texto' },
      orden: { columna: 'orden', conversion: 'entero' },
      activo: { columna: 'activa', conversion: 'booleano' },
    },
  },

  Ingrediente: {
    tabla: 'insumos',
    escritura: 'directa',
    ordenPorOmision: 'nombre',
    // Cocina nunca ve costos ni gramajes (F1-01 §3, regla 9). El filtro por rol
    // vive en `permisos.ts`; aquí sólo se declara qué existe.
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto' },
      unidad_base: { columna: 'unidad_base', conversion: 'texto' },
      // Las unidades base son sólo g, ml y pieza. No se amplían (regla 7).
      costo_por_unidad_base: { columna: 'costo_unitario_centavos', conversion: 'dinero' },
      stock_minimo: { columna: 'stock_minimo', conversion: 'decimal' },
      categoria_id: { columna: 'categoria_id', conversion: 'texto' },
      activo: { columna: 'activo', conversion: 'booleano' },
    },
  },

  RecetaEscandallo: {
    tabla: 'recetas',
    // `guardarReceta` es transaccional CON rollback: borrar las líneas viejas y
    // crear las nuevas sin transacción es el defecto D-11.
    escritura: 'comando',
    campos: {
      ...AUTO,
      producto_id: { columna: 'producto_id', conversion: 'texto' },
      ingrediente_id: { columna: 'insumo_id', conversion: 'texto' },
      cantidad: { columna: 'cantidad', conversion: 'decimal' },
      unidad: { columna: 'unidad', conversion: 'texto' },
      merma_porcentaje: { columna: 'merma_bp', conversion: 'puntos_base' },
    },
  },

  // ── Operación ────────────────────────────────────────────────────────────
  Venta: {
    tabla: 'ordenes',
    // `cobrarVenta` es transaccional. Escribir una venta campo por campo desde
    // el navegador —marcarla pagada y DESPUÉS procesar recetas, stock y
    // movimientos— es el defecto D-07, y no vuelve.
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...AUTO,
      folio: { columna: 'folio', conversion: 'texto', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      // `total` es la venta REAL, SIN propina. Nunca se infla (regla 1).
      total: { columna: 'total_centavos', conversion: 'dinero', escribible: false },
      subtotal: { columna: 'subtotal_centavos', conversion: 'dinero', escribible: false },
      descuento: { columna: 'descuento_centavos', conversion: 'dinero', escribible: false },
      impuestos: { columna: 'impuestos_centavos', conversion: 'dinero', escribible: false },
      costo_total: { columna: 'costo_total_centavos', conversion: 'dinero', escribible: false },
      utilidad: { columna: 'utilidad_centavos', conversion: 'dinero', escribible: false },
      margen_porcentaje: { columna: 'margen_bp', conversion: 'puntos_base', escribible: false },
      mesero_id: { columna: 'empleado_atiende_id', conversion: 'texto', escribible: false },
      cajero_id: { columna: 'empleado_cobra_id', conversion: 'texto', escribible: false },
      cliente_id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      sesion_caja_id: { columna: 'sesion_caja_id', conversion: 'texto', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
      motivo_cancelacion: { columna: 'motivo_cancelacion', conversion: 'texto', escribible: false },
      cancelada_en: { columna: 'cancelada_en', conversion: 'fecha', escribible: false },
    },
  },

  DetalleVenta: {
    tabla: 'orden_lineas',
    escritura: 'comando',
    campos: {
      ...AUTO,
      venta_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      // Los campos de INSTANTÁNEA son el contrato de trazabilidad (regla 11):
      // un ticket de hace seis meses tiene que seguir imprimiéndose aunque el
      // producto haya cambiado de precio o ya no exista.
      producto_nombre: { columna: 'producto_nombre', conversion: 'texto', escribible: false },
      sku: { columna: 'sku', conversion: 'texto', escribible: false },
      codigo_barras: { columna: 'codigo_barras', conversion: 'texto', escribible: false },
      cantidad: { columna: 'cantidad', conversion: 'decimal', escribible: false },
      unidad: { columna: 'unidad', conversion: 'texto', escribible: false },
      precio_unitario: {
        columna: 'precio_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      costo_unitario: {
        columna: 'costo_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      descuento: { columna: 'descuento_centavos', conversion: 'dinero', escribible: false },
      subtotal: { columna: 'subtotal_centavos', conversion: 'dinero', escribible: false },
      total: { columna: 'total_centavos', conversion: 'dinero', escribible: false },
      utilidad: { columna: 'utilidad_centavos', conversion: 'dinero', escribible: false },
      tipo_venta: { columna: 'tipo_venta', conversion: 'texto', escribible: false },
      cantidad_variable: { columna: 'cantidad_variable', conversion: 'decimal', escribible: false },
      unidad_variable: { columna: 'unidad_variable', conversion: 'texto', escribible: false },
      nombre_porcion: { columna: 'nombre_porcion', conversion: 'texto', escribible: false },
      cantidad_porciones: {
        columna: 'cantidad_porciones',
        conversion: 'decimal',
        escribible: false,
      },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
      orden_visual: { columna: 'orden_visual', conversion: 'entero', escribible: false },
    },
  },

  MovimientoInventario: {
    tabla: 'movimientos_stock',
    // El ledger es INMUTABLE: se escribe por comando y no se edita jamás.
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...soloAutomaticos(['id', 'created_date']),
      ingrediente_id: { columna: 'insumo_id', conversion: 'texto', escribible: false },
      almacen_id: { columna: 'almacen_id', conversion: 'texto', escribible: false },
      tipo: { columna: 'tipo', conversion: 'texto', escribible: false },
      // El signo se unifica en E4-7: negativo salidas, positivo entradas. Hoy
      // su POS de precio fijo guarda positivo y su Caja negativo, así que
      // cualquier reporte que sume da un número sin sentido (defecto D-10).
      cantidad: { columna: 'cantidad', conversion: 'decimal', escribible: false },
      unidad: { columna: 'unidad', conversion: 'texto', escribible: false },
      costo_unitario: {
        columna: 'costo_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      referencia_tipo: { columna: 'referencia_tipo', conversion: 'texto', escribible: false },
      referencia_id: { columna: 'referencia_id', conversion: 'texto', escribible: false },
      motivo: { columna: 'motivo', conversion: 'texto', escribible: false },
      usuario_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
    },
  },

  CorteCaja: {
    tabla: 'sesiones_caja',
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...AUTO,
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      fondo_inicial: { columna: 'fondo_inicial_centavos', conversion: 'dinero', escribible: false },
      efectivo_contado: {
        columna: 'efectivo_contado_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      efectivo_retirado: {
        columna: 'efectivo_retirado_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      abierta_en: { columna: 'abierta_en', conversion: 'fecha', escribible: false },
      cerrada_en: { columna: 'cerrada_en', conversion: 'fecha', escribible: false },
      usuario_apertura_id: { columna: 'empleado_abre_id', conversion: 'texto', escribible: false },
      usuario_cierre_id: { columna: 'empleado_cierra_id', conversion: 'texto', escribible: false },
      notas: { columna: 'notas_cierre', conversion: 'texto', escribible: false },
    },
  },
};

/**
 * `DescuentoInventarioVenta` — lo que Inventario llama «consumido hoy».
 *
 * No es una tabla: es una VISTA sobre el ledger, filtrada por los movimientos
 * que vinieron de una orden. Sólo lectura, obviamente: el ledger es inmutable.
 */
const DESCUENTO_INVENTARIO_VENTA: MapaEntidad = {
  tabla: 'movimientos_stock',
  escritura: 'lectura',
  ordenPorOmision: '-created_date',
  filtroFijo: { referencia_tipo: 'orden' },
  campos: {
    ...soloAutomaticos(['id', 'created_date']),
    venta_id: { columna: 'referencia_id', conversion: 'texto', escribible: false },
    ingrediente_id: { columna: 'insumo_id', conversion: 'texto', escribible: false },
    cantidad: { columna: 'cantidad', conversion: 'decimal', escribible: false },
    unidad: { columna: 'unidad', conversion: 'texto', escribible: false },
    costo_unitario: {
      columna: 'costo_unitario_centavos',
      conversion: 'dinero',
      escribible: false,
    },
  },
};

const TODAS: Readonly<Record<string, MapaEntidad>> = {
  ...MAPA,
  DescuentoInventarioVenta: DESCUENTO_INVENTARIO_VENTA,
};

export function entidadMapeada(nombre: string): MapaEntidad | null {
  return Object.prototype.hasOwnProperty.call(TODAS, nombre) ? (TODAS[nombre] ?? null) : null;
}
