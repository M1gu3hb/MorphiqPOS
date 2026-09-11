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
 * Tres entidades no son una tabla con columnas y viven aparte:
 * `ConfiguracionNegocio` es un documento JSON y está en `configuracion.ts`;
 * `UsuarioPOS` sale de cuatro tablas y está en `usuarios.ts`; `UnidadMedida`
 * no es una entidad, es un campo de texto separado por comas dentro de la
 * configuración. `DescuentoInventarioVenta` sí está aquí, al final, porque es
 * una vista sobre el ledger y se lee como cualquier otra cosa.
 *
 * ── Campos que su frontend lee y no son columnas ───────────────────────────
 * `mesa.mesero_asignado_nombre`, `venta.mesa_numero`, `gasto.usuario_nombre`…
 * Van en `derivados`, se resuelven con un `left join` de un salto y son de
 * sólo lectura. La vista `empleados_visibles` (migración 047) existe para que
 * «el nombre del mesero» sea un salto y no dos.
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

/**
 * Quién ve lo que el negocio GANA.
 *
 * Regla 12 de `F1-01` §3: «Cocina nunca ve costos, márgenes ni gramajes». Estaba
 * aplicada en las pantallas —Cocina no los pinta— y eso no es aplicarla: el
 * puente de lectura los servía a cualquiera con sesión, así que un mesero podía
 * pedirlos desde la consola del navegador con una sola petición.
 *
 * Ahora se declara por CAMPO, que es la única granularidad que sirve: el mesero
 * tiene que leer `ProductoTerminado` para tomar la comanda —nombre y precio— y
 * no tiene por qué leer su costo. Cerrar la entidad entera dejaría su pantalla
 * en blanco.
 */
const VE_MARGENES = ['dueno', 'administrador', 'gerente'] as const;

/**
 * Y quién ve lo que el negocio PAGA.
 *
 * Almacén compra: necesita el costo del insumo para registrar una compra y para
 * saber si le están cobrando de más. Lo que no ve es la utilidad ni el margen de
 * la venta, que es otra cosa.
 */
const VE_COSTOS_DE_INSUMO = ['dueno', 'administrador', 'gerente', 'almacen'] as const;

const TODOS_LOS_ROLES = [
  'dueno',
  'administrador',
  'gerente',
  'cajero',
  'mesero',
  'cocina',
  'almacen',
] as const;
const DIRECCION = ['dueno', 'administrador', 'gerente'] as const;
const CAJA = [...DIRECCION, 'cajero'] as const;
const COMPRAS = [...DIRECCION, 'almacen'] as const;
const RECETAS_E_INVENTARIO = [...DIRECCION, 'cocina', 'almacen'] as const;
const INVENTARIO = [...DIRECCION, 'almacen'] as const;
const OPERACION_RESTAURANTE = [...DIRECCION, 'cajero', 'mesero', 'cocina'] as const;
const PREPARACION = [...DIRECCION, 'cocina'] as const;

export const MAPA: Readonly<Record<string, MapaEntidad>> = {
  // ── Catálogo ─────────────────────────────────────────────────────────────
  ProductoTerminado: {
    tabla: 'productos',
    rolesLectura: [...TODOS_LOS_ROLES],
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
        rolesLectura: [...VE_MARGENES],
        columna: 'costo_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      // Los nombres son LOS SUYOS, no los que uno elegiría. `utilidad_unitaria`
      // y `margen_porcentaje` no existen en su esquema: se llaman así. Las dos
      // son columnas generadas en la base, así que no pueden desincronizarse
      // del costo aunque alguien lo intente.
      utilidad_bruta_actual: {
        rolesLectura: [...VE_MARGENES],
        columna: 'utilidad_unitaria_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      margen_bruto_actual: {
        rolesLectura: [...VE_MARGENES],
        columna: 'margen_bp',
        conversion: 'puntos_base',
        escribible: false,
      },
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
      ingrediente_base_id: { columna: 'insumo_base_id', conversion: 'texto' },
      // Lo que el restaurante añade (migración 045). Trece archivos suyos leen
      // `ingrediente_base_id`, diez `tipo_venta_snapshot` y cuatro
      // `visible_en_menu_digital`: sin estos campos, todos veían `undefined`.
      area_preparacion: { columna: 'area_preparacion', conversion: 'texto' },
      visible_en_menu_digital: {
        columna: 'visible_en_menu_digital',
        conversion: 'booleano',
        publico: true,
      },
      tiempo_preparacion_estimado: { columna: 'minutos_preparacion', conversion: 'entero' },
      notas: { columna: 'notas', conversion: 'texto' },
      presets_variable_qr: { columna: 'presets_variable', conversion: 'json', publico: true },
      presets_porcion_qr: { columna: 'presets_porcion', conversion: 'json', publico: true },
    },
    derivados: {
      // `Productos.jsx:249` lo lee y sin él la tarjeta dice «Sin categoría»
      // con la categoría bien puesta en la base.
      categoria_nombre: {
        tabla: 'categorias',
        porColumna: 'categoria_id',
        columna: 'nombre',
        conversion: 'texto',
        publico: true,
      },
      // Sin instantánea: `on delete restrict` impide que el insumo desaparezca
      // mientras un producto lo use como base.
      ingrediente_base_nombre: {
        tabla: 'insumos',
        porColumna: 'insumo_base_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  CategoriaProducto: {
    tabla: 'categorias',
    rolesLectura: [...TODOS_LOS_ROLES],
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
    rolesLectura: [...RECETAS_E_INVENTARIO],
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
    rolesLectura: [...RECETAS_E_INVENTARIO],
    escritura: 'directa',
    ordenPorOmision: 'nombre',
    // Cocina nunca ve costos ni gramajes (F1-01 §3, regla 9). El filtro por rol
    // vive en `permisos.ts`; aquí sólo se declara qué existe.
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto' },
      unidad_base: { columna: 'unidad_base', conversion: 'texto' },
      // Las unidades base son sólo g, ml y pieza. No se amplían (regla 7), y
      // desde la migración 046 lo impone la base para el giro restaurante.
      // El costo lo calcula el promedio ponderado del comando `registrarCompra`
      // sobre el stock anterior y el que entra. Aceptarlo del cliente es el
      // defecto D-13: hoy `importExecutors.js:44` lo sobrescribe con el valor
      // del CSV, sin ponderar, y pisa el costo histórico.
      costo_por_unidad_base: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        columna: 'costo_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      stock_minimo: { columna: 'stock_minimo', conversion: 'decimal' },
      // `STOCK_STATUS` (`constants.js:26`) tiene cinco niveles y necesita los
      // dos umbrales, no uno.
      stock_critico: { columna: 'stock_critico', conversion: 'decimal' },
      categoria_id: { columna: 'categoria_id', conversion: 'texto' },
      activo: { columna: 'activo', conversion: 'booleano' },
      unidad_compra_default: { columna: 'unidad_compra_default', conversion: 'texto' },
      cantidad_por_compra_default: {
        columna: 'cantidad_por_compra_default',
        conversion: 'decimal',
      },
      costo_compra_default: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        columna: 'costo_compra_default_centavos',
        conversion: 'dinero',
      },
      proveedor_default_id: { columna: 'proveedor_id', conversion: 'texto' },
      notas: { columna: 'notas', conversion: 'texto' },
      tipo_ingrediente: { columna: 'tipo_insumo', conversion: 'texto' },
      capacidad_contenedor_ml: { columna: 'capacidad_contenedor_ml', conversion: 'decimal' },
      porciones_por_contenedor_default: {
        columna: 'porciones_por_contenedor',
        conversion: 'decimal',
      },
      ml_por_porcion_default: { columna: 'ml_por_porcion', conversion: 'decimal' },
      nombre_porcion_default: { columna: 'nombre_porcion', conversion: 'texto' },
    },
    derivados: {
      /**
       * EL CAMBIO CONCEPTUAL MÁS GRANDE DE ESTA ENTIDAD (F1-04 §14.3).
       *
       * En su sistema `stock_actual` es una columna que se lee, se calcula y se
       * ESCRIBE, y es el defecto D-06: dos cajas cobrando a la vez se pisan el
       * número. Aquí es la proyección del ledger, sumada por la vista
       * `existencias_por_insumo` (migración 048), y sólo se puede LEER.
       *
       * `Ingrediente.update(id, {stock_actual})` deja de funcionar a propósito:
       * es exactamente la operación que corrompe el inventario. Los tres sitios
       * que la hacen pasan a `ajustarInventario` e `inventarioInicial`.
       */
      stock_actual: {
        tabla: 'existencias_por_insumo',
        porColumna: 'id',
        emparejaCon: 'insumo_id',
        columna: 'cantidad',
        conversion: 'decimal',
      },
      valor_inventario: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        tabla: 'existencias_por_insumo',
        porColumna: 'id',
        emparejaCon: 'insumo_id',
        columna: 'valor_centavos',
        conversion: 'dinero',
      },
      // `Inventario.jsx:122` resuelve hoy el nombre en el navegador contra una
      // lista que descarga entera. Aquí sale del `join` y de paso deja de
      // depender de que esa lista esté cargada.
      categoria_nombre: {
        tabla: 'categorias',
        porColumna: 'categoria_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  RecetaEscandallo: {
    tabla: 'recetas',
    rolesLectura: [...RECETAS_E_INVENTARIO],
    // `guardarReceta` es transaccional CON rollback: borrar las líneas viejas y
    // crear las nuevas sin transacción es el defecto D-11.
    escritura: 'comando',
    campos: {
      ...AUTO,
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      ingrediente_id: { columna: 'insumo_id', conversion: 'texto', escribible: false },
      // Lo que el usuario TECLEÓ, tal como lo tecleó, para poder reeditarlo.
      cantidad_usada: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        columna: 'cantidad_capturada',
        conversion: 'decimal',
        escribible: false,
      },
      unidad_usada: { columna: 'unidad_capturada', conversion: 'texto', escribible: false },
      // Lo CONVERTIDO, que es lo que consume el inventario. Que sean dos
      // columnas distintas es lo que cierra el error de 1000×: hoy
      // `RecetaFormDialog.jsx:225` guarda la cantidad sin convertir y la unidad
      // es un input de texto libre, así que escribir «kg» en un insumo medido
      // en gramos multiplica por mil el consumo y el costo. La conversión la
      // hace `guardarReceta` en el servidor, y lanza si las dimensiones no
      // coinciden en vez de dejar pasar el valor.
      cantidad_convertida_unidad_base: {
        columna: 'cantidad',
        conversion: 'decimal',
        escribible: false,
      },
      unidad: { columna: 'unidad', conversion: 'texto', escribible: false },
      merma_porcentaje: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        columna: 'merma_bp',
        conversion: 'puntos_base',
        escribible: false,
      },
      // «Receta» es femenino: la columna es `activa`.
      activo: { columna: 'activa', conversion: 'booleano', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
    },
    derivados: {
      // Sin instantánea a propósito: `on delete restrict` impide que el insumo
      // desaparezca mientras una receta lo use.
      ingrediente_nombre: {
        tabla: 'insumos',
        porColumna: 'insumo_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      // EN VIVO, no instantánea. Es la mitad de D-09: hoy es una copia del
      // costo del ingrediente al guardar la receta y nada la refresca, así que
      // al subir el precio del café el costo del capuchino se queda como
      // estaba. Derivándolo, cambia en la siguiente lectura.
      costo_unitario_base_snapshot: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        tabla: 'insumos',
        porColumna: 'insumo_id',
        columna: 'costo_unitario_centavos',
        conversion: 'dinero',
      },
    },
    calculados: {
      // Lo que su pantalla de Productos suma para enseñar el costo de cada
      // producto. Sin esto, Productos enseña COSTO $0.00 y MARGEN 100 % con la
      // base llena de costos correctos.
      costo_linea_calculado: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        formula: 'costoDeLineaDeReceta',
        conversion: 'dinero',
      },
    },
  },

  // ── Operación ────────────────────────────────────────────────────────────
  Venta: {
    tabla: 'ordenes',
    rolesLectura: [...OPERACION_RESTAURANTE],
    // `cobrarVenta` es transaccional. Escribir una venta campo por campo desde
    // el navegador —marcarla pagada y DESPUÉS procesar recetas, stock y
    // movimientos— es el defecto D-07, y no vuelve.
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...AUTO,
      folio: { columna: 'folio', conversion: 'texto', escribible: false },
      /**
       * La tabla de `F1-04` §6.6. Su vocabulario y el de la base coinciden en
       * cinco de siete estados y difieren en los dos que MÁS se escriben:
       * `abierta` es `borrador` y `enviada` es `confirmada`.
       *
       * Sin esta traducción, `Mesero.jsx` filtra por `estado: 'abierta'` y no
       * encuentra ninguna mesa abierta, con las mesas abiertas en la base.
       */
      estado: {
        columna: 'estado',
        conversion: 'texto',
        escribible: false,
        traduccion: { borrador: 'abierta', confirmada: 'enviada' },
      },
      // `total` es la venta REAL, SIN propina. Nunca se infla (regla 1).
      total: {
        rolesLectura: [...CAJA],
        columna: 'total_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      subtotal: {
        rolesLectura: [...CAJA],
        columna: 'subtotal_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      // LOS NOMBRES SON LOS SUYOS. Nueve archivos leen `costo_total_snapshot`,
      // nueve `utilidad_bruta_snapshot`, seis `usuario_mesero_id` y cinco
      // `corte_caja_id`. Llamarlos como uno querría dejaría a los veintinueve
      // viendo `undefined`, sin error y sin aviso.
      descuentos: {
        rolesLectura: [...CAJA],
        columna: 'descuento_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      impuestos: {
        rolesLectura: [...CAJA],
        columna: 'impuestos_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      costo_total_snapshot: {
        rolesLectura: [...VE_MARGENES],
        columna: 'costo_total_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      utilidad_bruta_snapshot: {
        rolesLectura: [...VE_MARGENES],
        columna: 'utilidad_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      margen_snapshot: {
        rolesLectura: [...VE_MARGENES],
        columna: 'margen_bp',
        conversion: 'puntos_base',
        escribible: false,
      },
      usuario_mesero_id: {
        columna: 'empleado_atiende_id',
        conversion: 'texto',
        escribible: false,
      },
      usuario_cajero_id: { columna: 'empleado_cobra_id', conversion: 'texto', escribible: false },
      cliente_id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      corte_caja_id: { columna: 'sesion_caja_id', conversion: 'texto', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
      motivo_cancelacion: { columna: 'motivo_cancelacion', conversion: 'texto', escribible: false },
      cancelada_en: { columna: 'cancelada_en', conversion: 'fecha', escribible: false },

      // ── Lo que el restaurante añade (migración 045) ──────────────────────
      fecha_cierre: { columna: 'cerrada_en', conversion: 'fecha', escribible: false },
      mesa_id: { columna: 'mesa_id', conversion: 'texto', escribible: false },
      personas: { columna: 'personas', conversion: 'entero', escribible: false },
      cliente_nombre: { columna: 'cliente_nombre', conversion: 'texto', escribible: false },
      notas_alergias: { columna: 'notas_alergias', conversion: 'texto', escribible: false },
      celebracion_especial: {
        columna: 'celebracion_especial',
        conversion: 'booleano',
        escribible: false,
      },
      tipo_celebracion: { columna: 'tipo_celebracion', conversion: 'texto', escribible: false },
      // El código que el comensal lleva impreso a la caja (M05-4821). NO es
      // una terminal: la inscripción de terminales se eliminó del plan.
      codigo_caja: { columna: 'codigo_caja', conversion: 'texto', escribible: false },
      propina_porcentaje: {
        rolesLectura: [...CAJA],
        columna: 'propina_puntos_base',
        conversion: 'puntos_base',
        escribible: false,
      },
      propina_tipo: {
        rolesLectura: [...CAJA],
        columna: 'propina_tipo',
        conversion: 'texto',
        escribible: false,
      },
      propina_origen: {
        rolesLectura: [...CAJA],
        columna: 'propina_origen',
        conversion: 'texto',
        escribible: false,
      },
      propina_liquidacion_id: {
        rolesLectura: [...DIRECCION],
        columna: 'propina_liquidacion_id',
        conversion: 'texto',
        escribible: false,
      },
      propina_liquidada_fecha: {
        rolesLectura: [...DIRECCION],
        columna: 'propina_liquidada_en',
        conversion: 'fecha',
        escribible: false,
      },
      satisfaccion_score: {
        columna: 'satisfaccion_score',
        conversion: 'entero',
        escribible: false,
      },
      satisfaccion_emoji: { columna: 'satisfaccion_emoji', conversion: 'texto', escribible: false },
      satisfaccion_comentario: {
        columna: 'satisfaccion_comentario',
        conversion: 'texto',
        escribible: false,
      },
      satisfaccion_fecha: { columna: 'satisfaccion_en', conversion: 'fecha', escribible: false },
    },
    derivados: {
      // El número de mesa se DERIVA, no se copia. Riesgo asumido y anotado en
      // `F1-04` §38.1: si alguien renumera la mesa 5 como 7, un ticket viejo
      // pasará a decir 7. Se acepta porque no es dinero ni identidad de
      // producto, y `mesas` usa borrado suave.
      mesa_numero: {
        tabla: 'mesas',
        porColumna: 'mesa_id',
        columna: 'numero',
        conversion: 'entero',
      },
      usuario_mesero_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_atiende_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      usuario_cajero_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_cobra_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  DetalleVenta: {
    tabla: 'orden_lineas',
    rolesLectura: [...OPERACION_RESTAURANTE],
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
      // El sufijo `_snapshot` es SUYO y se conserva. Diez archivos leen
      // `tipo_venta_snapshot` y cinco `ingrediente_base_id_snapshot`: llamarlos
      // como uno querría dejaría a los quince viendo `undefined`.
      precio_unitario_snapshot: {
        columna: 'precio_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      costo_unitario_snapshot: {
        rolesLectura: [...VE_MARGENES],
        columna: 'costo_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      descuento: { columna: 'descuento_centavos', conversion: 'dinero', escribible: false },
      subtotal: { columna: 'subtotal_centavos', conversion: 'dinero', escribible: false },
      total: { columna: 'total_centavos', conversion: 'dinero', escribible: false },
      utilidad: {
        rolesLectura: [...VE_MARGENES],
        columna: 'utilidad_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      tipo_venta_snapshot: { columna: 'tipo_venta', conversion: 'texto', escribible: false },
      cantidad_variable_snapshot: {
        columna: 'cantidad_variable',
        conversion: 'decimal',
        escribible: false,
      },
      unidad_variable_snapshot: {
        columna: 'unidad_variable',
        conversion: 'texto',
        escribible: false,
      },
      nombre_porcion_snapshot: {
        columna: 'nombre_porcion',
        conversion: 'texto',
        escribible: false,
      },
      cantidad_porciones_snapshot: {
        columna: 'cantidad_porciones',
        conversion: 'decimal',
        escribible: false,
      },
      notas_producto: { columna: 'notas', conversion: 'texto', escribible: false },
      orden_visual: { columna: 'orden_visual', conversion: 'entero', escribible: false },

      // ── El contrato de trazabilidad del restaurante (migración 045) ──────
      estado_preparacion: {
        columna: 'estado_preparacion',
        conversion: 'texto',
        escribible: false,
      },
      area_preparacion_snapshot: {
        columna: 'area_preparacion_snapshot',
        conversion: 'texto',
        escribible: false,
      },
      // Lo que se descuenta del inventario, en unidad base. NO coincide con la
      // cantidad vendida cuando el producto se vende por peso o por porción, y
      // confundirlas es un error de 1000× en el consumo.
      cantidad_base_consumo: {
        columna: 'cantidad_base_consumo',
        conversion: 'decimal',
        escribible: false,
      },
      ingrediente_base_id_snapshot: {
        columna: 'insumo_base_id',
        conversion: 'texto',
        escribible: false,
      },
      ingrediente_base_nombre_snapshot: {
        columna: 'insumo_base_nombre',
        conversion: 'texto',
        escribible: false,
      },
      precio_por_unidad_snapshot: {
        columna: 'precio_por_unidad_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      ml_por_porcion_snapshot: {
        columna: 'ml_por_porcion',
        conversion: 'decimal',
        escribible: false,
      },
    },
  },

  MovimientoInventario: {
    tabla: 'movimientos_stock',
    rolesLectura: [...INVENTARIO],
    // El ledger es INMUTABLE: se escribe por comando y no se edita jamás.
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...soloAutomaticos(['id', 'created_date']),
      ingrediente_id: { columna: 'insumo_id', conversion: 'texto', escribible: false },
      almacen_id: { columna: 'almacen_id', conversion: 'texto', escribible: false },
      // Sus nombres, no los de la tabla: nueve archivos leen `tipo_movimiento`
      // y treinta leen `unidad_base`.
      tipo_movimiento: { columna: 'tipo', conversion: 'texto', escribible: false },
      // El signo ya lo impone la base desde `003_venta_caja_inventario.sql`:
      // entradas positivas, salidas negativas, con un `check` que lo ata al
      // tipo. Es lo que cierra D-10 de raíz —su POS guardaba positivo y su Caja
      // negativo, y cualquier reporte que sumara daba un número sin sentido—,
      // y por eso E4-7 no necesita migrar datos: en este esquema nunca pudo
      // escribirse mal.
      cantidad: { columna: 'cantidad', conversion: 'decimal', escribible: false },
      unidad_base: { columna: 'unidad', conversion: 'texto', escribible: false },
      costo_unitario_en_momento: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        columna: 'costo_unitario_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      referencia_tipo: { columna: 'referencia_tipo', conversion: 'texto', escribible: false },
      referencia_id: { columna: 'referencia_id', conversion: 'texto', escribible: false },
      motivo: { columna: 'motivo', conversion: 'texto', escribible: false },
      usuario_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
    },
    derivados: {
      ingrediente_nombre: {
        tabla: 'insumos',
        porColumna: 'insumo_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      usuario_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  CorteCaja: {
    tabla: 'sesiones_caja',
    rolesLectura: [...CAJA],
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...AUTO,
      /**
       * `sesiones_caja.estado` guarda `abierta` y `cerrada`; su
       * `useCajaAbierta.js:43` busca `'abierto'` y `'cerrado'`. El campo se
       * llamaba igual y el valor no, así que su POS decía «Caja cerrada» con la
       * caja abierta y el fondo contado. Un fallo así no da error en ningún
       * sitio: simplemente nada funciona.
       */
      estado: {
        columna: 'estado',
        conversion: 'texto',
        escribible: false,
        traduccion: { abierta: 'abierto', cerrada: 'cerrado' },
      },
      /**
       * Siempre `cierre_diario`, porque venir de `sesiones_caja` es exactamente
       * eso: el corte de TURNO vive en `cortes_turno` (F1-04 §20.1). Su
       * `useCajaAbierta` compara contra este literal, así que tiene que llegar.
       */
      tipo_corte: {
        columna: 'estado',
        conversion: 'texto',
        escribible: false,
        constante: 'cierre_diario',
      },
      // Sus nombres. Dieciséis archivos leen `fecha_apertura` y tres
      // `efectivo_inicial_contado`.
      serie: { columna: 'serie', conversion: 'texto', escribible: false },
      folio: { columna: 'folio', conversion: 'texto', escribible: false },
      efectivo_inicial_contado: {
        columna: 'fondo_inicial_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      fondo_esperado_apertura: {
        columna: 'fondo_esperado_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      notas_apertura: { columna: 'notas_apertura', conversion: 'texto', escribible: false },
      efectivo_contado: {
        columna: 'efectivo_contado_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      dinero_dejado_en_caja: {
        columna: 'efectivo_retirado_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      fecha_apertura: { columna: 'abierta_en', conversion: 'fecha', escribible: false },
      fecha_cierre: { columna: 'cerrada_en', conversion: 'fecha', escribible: false },
      usuario_apertura_id: { columna: 'empleado_abre_id', conversion: 'texto', escribible: false },
      usuario_cajero_id: { columna: 'empleado_cierra_id', conversion: 'texto', escribible: false },
      notas: { columna: 'notas_cierre', conversion: 'texto', escribible: false },
    },
    derivados: {
      usuario_apertura_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_abre_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      usuario_cajero_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_cierra_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  // ── Restaurante: sala ────────────────────────────────────────────────────
  /**
   * `Zona` no es una entidad suya: hoy es un arreglo literal en
   * `lib/constants.js:118` y `Mesa.zona` es texto libre sin llave foránea.
   *
   * Por eso una mesa con una zona fuera de las cinco DESAPARECE de la interfaz:
   * el filtrado hace `(m.zona || 'Interior') === zonaFiltro` en cuatro sitios y
   * no hay pestaña que la muestre. Como tabla, esa zona deja de poder
   * escribirse, y el defecto se cierra sin tocar una línea de sus pantallas.
   */
  Zona: {
    tabla: 'zonas',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'directa',
    ordenPorOmision: 'orden',
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto', publico: true },
      orden: { columna: 'orden', conversion: 'entero', publico: true },
      activo: { columna: 'activa', conversion: 'booleano' },
    },
  },

  Mesa: {
    tabla: 'mesas',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'directa',
    // `mesas.sucursal_id` es `not null`: la pone el servidor desde la sesión.
    conSucursal: true,
    ordenPorOmision: 'numero',
    campos: {
      ...AUTO,
      numero: { columna: 'numero', conversion: 'entero', publico: true },
      nombre: { columna: 'nombre', conversion: 'texto', publico: true },
      zona_id: { columna: 'zona_id', conversion: 'texto' },
      capacidad: { columna: 'capacidad', conversion: 'entero' },
      forma: { columna: 'forma', conversion: 'texto' },
      tamano: { columna: 'tamano', conversion: 'texto' },
      posicion_x: { columna: 'posicion_x', conversion: 'entero' },
      posicion_y: { columna: 'posicion_y', conversion: 'entero' },
      orden: { columna: 'orden', conversion: 'entero' },
      // Abrir, ocupar, pedir la cuenta y liberar son TRANSICIONES, no campos.
      // Cada una tiene su comando (E6); el puente no las deja escribir sueltas,
      // porque «mesa libre con venta viva» es exactamente lo que hoy obliga a
      // `detectarHuerfano` a existir.
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      venta_activa_id: { columna: 'orden_activa_id', conversion: 'texto', escribible: false },
      personas_actuales: { columna: 'personas_actuales', conversion: 'entero', escribible: false },
      cliente_temporal: { columna: 'cliente_temporal', conversion: 'texto', escribible: false },
      notas_alergias: { columna: 'notas_alergias', conversion: 'texto', escribible: false },
      celebracion_especial: {
        columna: 'celebracion_especial',
        conversion: 'booleano',
        escribible: false,
      },
      tipo_celebracion: { columna: 'tipo_celebracion', conversion: 'texto', escribible: false },
      qr_token: {
        rolesLectura: [...DIRECCION],
        columna: 'qr_token',
        conversion: 'texto',
        escribible: false,
      },
      qr_activo: { columna: 'qr_activa', conversion: 'booleano' },
      mesero_asignado_id: { columna: 'empleado_asignado_id', conversion: 'texto' },
      atendido_por_id: { columna: 'empleado_atiende_id', conversion: 'texto', escribible: false },
      // «Mesa» es femenino: la columna es `activa` y su campo es `activo`.
      activo: { columna: 'activa', conversion: 'booleano' },
    },
    derivados: {
      zona: { tabla: 'zonas', porColumna: 'zona_id', columna: 'nombre', conversion: 'texto' },
      mesero_asignado_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_asignado_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      mesero_asignado_color: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_asignado_id',
        columna: 'color',
        conversion: 'texto',
        respaldo: 'colorDePersona',
      },
      atendido_por_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_atiende_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      atendido_por_color: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_atiende_id',
        columna: 'color',
        conversion: 'texto',
        respaldo: 'colorDePersona',
      },
    },
  },

  EstacionPreparacion: {
    tabla: 'estaciones_preparacion',
    rolesLectura: [...PREPARACION],
    escritura: 'directa',
    ordenPorOmision: 'orden',
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto' },
      descripcion: { columna: 'descripcion', conversion: 'texto' },
      color: { columna: 'color', conversion: 'texto' },
      icono: { columna: 'icono', conversion: 'texto' },
      orden: { columna: 'orden', conversion: 'entero' },
      // «Estación» es femenino: columna `activa`, campo `activo`.
      activo: { columna: 'activa', conversion: 'booleano' },
      // La estación general es el respaldo obligatorio (regla 10). Que haya
      // una sola y que no se pueda apagar lo imponen ahora un índice único
      // parcial y un `check`, no tres comprobaciones del navegador.
      es_general: { columna: 'es_general', conversion: 'booleano', escribible: false },
    },
  },

  /**
   * `PedidoPreparacion` es la comanda. Se parte en `comandas` (la cabecera) y
   * `comanda_items` (las líneas) porque cocina consulta y actualiza item por
   * item, en vivo, con dos pantallas abiertas.
   *
   * Es transaccional: enviar el pedido escribe la comanda, sus items y el
   * estado de las líneas de venta en la MISMA transacción. Hoy `POS.jsx:462`
   * se traga el error del `create` y el pedido no llega a cocina sin que nadie
   * se entere.
   */
  PedidoPreparacion: {
    tabla: 'comandas',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...AUTO,
      venta_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      mesa_id: { columna: 'mesa_id', conversion: 'texto', escribible: false },
      // `area` se conserva por compatibilidad declarada: `Cocina` filtra por
      // ella (`PedidoPreparacion.jsonc:24`).
      area: { columna: 'area', conversion: 'texto', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      fecha_inicio: { columna: 'iniciada_en', conversion: 'fecha', escribible: false },
      fecha_listo: { columna: 'lista_en', conversion: 'fecha', escribible: false },
      fecha_entregado: { columna: 'entregada_en', conversion: 'fecha', escribible: false },
      usuario_responsable_id: {
        columna: 'empleado_responsable_id',
        conversion: 'texto',
        escribible: false,
      },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
      estacion_preparacion_id: {
        columna: 'estacion_preparacion_id',
        conversion: 'texto',
        escribible: false,
      },
      // Instantáneas: la cocina las pinta y la estación puede desactivarse.
      estacion_preparacion_nombre: {
        columna: 'estacion_nombre',
        conversion: 'texto',
        escribible: false,
      },
      estacion_preparacion_color: {
        columna: 'estacion_color',
        conversion: 'texto',
        escribible: false,
      },
      origen_pedido: { columna: 'origen', conversion: 'texto', escribible: false },
      notas_alergias: { columna: 'notas_alergias', conversion: 'texto', escribible: false },
      celebracion_especial: {
        columna: 'celebracion_especial',
        conversion: 'booleano',
        escribible: false,
      },
      tipo_celebracion: { columna: 'tipo_celebracion', conversion: 'texto', escribible: false },
    },
    derivados: {
      mesa_numero: {
        tabla: 'mesas',
        porColumna: 'mesa_id',
        columna: 'numero',
        conversion: 'entero',
      },
    },
    hijos: {
      /**
       * Su pantalla de Cocina pinta `pedido.items` directamente. Sin esto la
       * comanda le llega diciendo «0 items · Sin productos» con los tres platos
       * en la base — comprobado abriendo la pantalla.
       *
       * Sesenta es el tope de líneas de un pedido; una comanda de una estación
       * nunca las tiene todas, pero el tope va donde está el dato y no donde
       * uno cree que estará.
       */
      items: { entidad: 'PedidoPreparacionItem', porCampo: 'pedido_id', limite: 60 },
    },
  },

  /**
   * Las líneas de la comanda. Su código las lee dentro de
   * `PedidoPreparacion.items`; el puente las expone también como entidad
   * propia porque cocina marca UNA línea como lista sin tocar las demás.
   */
  PedidoPreparacionItem: {
    tabla: 'comanda_items',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'comando',
    ordenPorOmision: 'orden_visual',
    campos: {
      ...AUTO,
      pedido_id: { columna: 'comanda_id', conversion: 'texto', escribible: false },
      detalle_venta_id: { columna: 'orden_linea_id', conversion: 'texto', escribible: false },
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      producto_nombre: { columna: 'producto_nombre', conversion: 'texto', escribible: false },
      cantidad: { columna: 'cantidad', conversion: 'decimal', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      tipo_venta: { columna: 'tipo_venta', conversion: 'texto', escribible: false },
      unidad_variable: { columna: 'unidad_variable', conversion: 'texto', escribible: false },
      cantidad_variable: { columna: 'cantidad_variable', conversion: 'decimal', escribible: false },
      nombre_porcion: { columna: 'nombre_porcion', conversion: 'texto', escribible: false },
      cantidad_porciones: {
        columna: 'cantidad_porciones',
        conversion: 'decimal',
        escribible: false,
      },
      orden_visual: { columna: 'orden_visual', conversion: 'entero', escribible: false },
    },
  },

  // ── Restaurante: portal QR ───────────────────────────────────────────────
  SolicitudQR: {
    tabla: 'solicitudes_qr',
    rolesLectura: [...OPERACION_RESTAURANTE],
    // Crear una solicitud, atenderla y resolverla mueven mesa y venta. Y el
    // anti-duplicado de `PortalCliente.jsx:524-532` es un TOCTOU (D-17) que
    // ahora cierra un índice único parcial.
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...AUTO,
      mesa_id: { columna: 'mesa_id', conversion: 'texto', escribible: false },
      venta_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      tipo: { columna: 'tipo', conversion: 'texto', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      fecha_atendida: { columna: 'atendida_en', conversion: 'fecha', escribible: false },
      fecha_resuelta: { columna: 'resuelta_en', conversion: 'fecha', escribible: false },
      atendido_por_id: { columna: 'empleado_atiende_id', conversion: 'texto', escribible: false },
      mesero_destino_id: {
        columna: 'empleado_destino_id',
        conversion: 'texto',
        escribible: false,
      },
      ruteo_modo: { columna: 'ruteo_modo', conversion: 'texto', escribible: false },
      origen: { columna: 'origen', conversion: 'texto', escribible: false },
      token_mesa: {
        rolesLectura: [...DIRECCION],
        columna: 'token_mesa',
        conversion: 'texto',
        escribible: false,
      },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
      subtotal_consumo: {
        columna: 'subtotal_consumo_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      propina_monto_sugerida: {
        columna: 'propina_sugerida_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      propina_porcentaje_sugerido: {
        columna: 'propina_sugerida_bp',
        conversion: 'puntos_base',
        escribible: false,
      },
      propina_tipo: { columna: 'propina_tipo', conversion: 'texto', escribible: false },
    },
    derivados: {
      mesa_numero: {
        tabla: 'mesas',
        porColumna: 'mesa_id',
        columna: 'numero',
        conversion: 'entero',
      },
      mesa_nombre: {
        tabla: 'mesas',
        porColumna: 'mesa_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      atendido_por_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_atiende_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      mesero_destino_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_destino_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  /**
   * Una de las tres entidades legibles SIN sesión: el comensal que escanea el
   * código todavía no ha entrado a ningún sitio. Por eso cada campo lleva
   * `publico`, y por eso `archivo_url` no existe: está muerto en su código.
   */
  MenuQRSeccion: {
    tabla: 'menu_qr_secciones',
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'directa',
    ordenPorOmision: 'orden',
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto', publico: true },
      descripcion: { columna: 'descripcion', conversion: 'texto', publico: true },
      imagen_url: { columna: 'imagen_url', conversion: 'texto', publico: true },
      orden: { columna: 'orden', conversion: 'entero', publico: true },
      // «Sección» es femenino: columna `activa`, campo `activo`.
      activo: { columna: 'activa', conversion: 'booleano', publico: true },
    },
  },

  // ── Restaurante: compras y gastos ────────────────────────────────────────
  /**
   * Su nombre es `CompraInsumo`, no `Compra`. Estuvo a punto de quedarse fuera
   * del puente por eso.
   *
   * Es un comando: hoy `RegistrarCompraDialog.jsx:229` crea la cabecera y el
   * bucle de líneas va después, sin transacción. Si falla la línea 3 de 5,
   * queda la cabecera con el total correcto y tres líneas. Es el defecto D-12.
   */
  CompraInsumo: {
    tabla: 'compras',
    rolesLectura: [...COMPRAS],
    escritura: 'comando',
    ordenPorOmision: '-fecha',
    campos: {
      ...AUTO,
      proveedor_id: { columna: 'proveedor_id', conversion: 'texto', escribible: false },
      // Instantánea: es lo que justifica el borrado suave del proveedor.
      proveedor_nombre: { columna: 'proveedor_nombre', conversion: 'texto', escribible: false },
      fecha: { columna: 'fecha', conversion: 'dia', escribible: false },
      total_compra: { columna: 'total_centavos', conversion: 'dinero', escribible: false },
      metodo_pago: { columna: 'metodo_pago', conversion: 'texto', escribible: false },
      factura_folio: { columna: 'factura_folio', conversion: 'texto', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
      usuario_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
    },
    derivados: {
      usuario_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  /** Su nombre es `DetalleCompra`, no `CompraLinea`. */
  DetalleCompra: {
    tabla: 'compra_lineas',
    rolesLectura: [...COMPRAS],
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...AUTO,
      compra_id: { columna: 'compra_id', conversion: 'texto', escribible: false },
      ingrediente_id: { columna: 'insumo_id', conversion: 'texto', escribible: false },
      ingrediente_nombre: { columna: 'insumo_nombre', conversion: 'texto', escribible: false },
      // Lo que el usuario tecleó, EN SU UNIDAD.
      cantidad_comprada: {
        columna: 'cantidad_capturada',
        conversion: 'decimal',
        escribible: false,
      },
      unidad_compra: { columna: 'unidad_capturada', conversion: 'texto', escribible: false },
      // Cuántas unidades base trae UNA unidad capturada. Hoy se usa para
      // calcular y NO se guarda, así que una compra de «3 cajas» queda sin
      // decir en ningún lado que una caja traía 12 kg: inauditable.
      piezas_por_paquete: { columna: 'equivalencia', conversion: 'decimal', escribible: false },
      cantidad_convertida_unidad_base: {
        columna: 'cantidad',
        conversion: 'decimal',
        escribible: false,
      },
      costo_total: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        columna: 'costo_total_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      fecha_caducidad: { columna: 'caduca_el', conversion: 'dia', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
    },
  },

  Proveedor: {
    tabla: 'proveedores',
    rolesLectura: [...COMPRAS],
    escritura: 'directa',
    ordenPorOmision: 'nombre',
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto' },
      contacto: { columna: 'contacto', conversion: 'texto' },
      telefono: { columna: 'telefono', conversion: 'texto' },
      whatsapp: { columna: 'whatsapp', conversion: 'texto' },
      correo: { columna: 'correo', conversion: 'texto' },
      direccion: { columna: 'direccion', conversion: 'texto' },
      notas: { columna: 'notas', conversion: 'texto' },
      activo: { columna: 'activo', conversion: 'booleano' },
    },
  },

  /**
   * Un gasto en efectivo SALE DEL CAJÓN: por eso es un comando, y por eso
   * escribe también el movimiento de caja y el contador de la plantilla en la
   * misma transacción.
   */
  GastoOperativo: {
    tabla: 'gastos',
    rolesLectura: [...CAJA],
    escritura: 'comando',
    ordenPorOmision: '-fecha',
    campos: {
      ...AUTO,
      fecha: { columna: 'fecha', conversion: 'dia', escribible: false },
      categoria: { columna: 'categoria', conversion: 'texto', escribible: false },
      descripcion: { columna: 'descripcion', conversion: 'texto', escribible: false },
      monto: { columna: 'monto_centavos', conversion: 'dinero', escribible: false },
      metodo_pago: { columna: 'metodo_pago', conversion: 'texto', escribible: false },
      usuario_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
      // Hoy no es un booleano: `RegistrarGastoDialog.jsx:51-53` antepone el
      // texto «[RECURRENTE/FIJO MENSUAL]» a las notas, y se pierde en cuanto
      // alguien edita la nota.
      recurrente: { columna: 'es_recurrente', conversion: 'booleano', escribible: false },
      // Ídem con el vínculo a la plantilla, que hoy vive dentro del texto
      // «[Desde plantilla: X]» y sostiene el anti-duplicado de `:81`.
      plantilla_id: { columna: 'plantilla_gasto_id', conversion: 'texto', escribible: false },
      sesion_caja_id: { columna: 'sesion_caja_id', conversion: 'texto', escribible: false },
    },
    derivados: {
      usuario_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  PlantillaGasto: {
    tabla: 'plantillas_gasto',
    rolesLectura: [...DIRECCION],
    escritura: 'directa',
    ordenPorOmision: 'nombre',
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto' },
      categoria: { columna: 'categoria', conversion: 'texto' },
      monto_sugerido: { columna: 'monto_sugerido_centavos', conversion: 'dinero' },
      metodo_pago: { columna: 'metodo_pago', conversion: 'texto' },
      periodicidad: { columna: 'periodicidad', conversion: 'texto' },
      dia_pago_sugerido: { columna: 'dia_pago_sugerido', conversion: 'entero' },
      notas: { columna: 'notas', conversion: 'texto' },
      activa: { columna: 'activa', conversion: 'booleano' },
      // Los contadores los mueve el comando que crea el gasto, en su misma
      // transacción. Aceptarlos del cliente los volvería adorno.
      ultima_fecha_uso: { columna: 'ultimo_uso_en', conversion: 'fecha', escribible: false },
      veces_usada: { columna: 'veces_usada', conversion: 'entero', escribible: false },
    },
  },

  PlantillaCompra: {
    tabla: 'plantillas_compra',
    rolesLectura: [...COMPRAS],
    escritura: 'directa',
    ordenPorOmision: 'nombre',
    campos: {
      ...AUTO,
      nombre: { columna: 'nombre', conversion: 'texto' },
      proveedor_nombre: { columna: 'proveedor_nombre', conversion: 'texto' },
      // Es la excepción a normalizar los arreglos embebidos, y la diferencia
      // es real: `lineas` se lee ENTERA para precargar un formulario y nunca
      // se actualiza parcialmente. `comanda_items`, en cambio, se consulta y
      // se actualiza fila por fila desde cocina, en vivo.
      lineas: { columna: 'lineas', conversion: 'json' },
      activa: { columna: 'activa', conversion: 'booleano' },
      notas: { columna: 'notas', conversion: 'texto' },
      ultima_fecha_uso: { columna: 'ultimo_uso_en', conversion: 'fecha', escribible: false },
      veces_usada: { columna: 'veces_usada', conversion: 'entero', escribible: false },
    },
  },

  /**
   * Liquidar propinas marca N ventas y crea la liquidación. Hoy
   * `LiquidarPropinasDialog.jsx:122` se traga los errores de esos `update`, así
   * que el booleano `propina_liquidada` se desincroniza del puntero de verdad.
   * Por eso `propina_liquidada` se DERIVA y esto es un comando.
   */
  LiquidacionPropina: {
    tabla: 'liquidaciones_propina',
    rolesLectura: [...DIRECCION],
    escritura: 'comando',
    // El orden se declara con SU nombre de campo, no con el de la columna: es
    // lo que el frontend manda en `list('-fecha_liquidacion')`. Lo cazó la
    // prueba de forma del mapa.
    ordenPorOmision: '-fecha_liquidacion',
    campos: {
      ...AUTO,
      serie: { columna: 'serie', conversion: 'texto', escribible: false },
      folio: { columna: 'folio', conversion: 'texto', escribible: false },
      fecha_liquidacion: { columna: 'liquidada_en', conversion: 'fecha', escribible: false },
      rango_inicio: { columna: 'rango_inicio', conversion: 'fecha', escribible: false },
      rango_fin: { columna: 'rango_fin', conversion: 'fecha', escribible: false },
      rango_tipo: { columna: 'rango_tipo', conversion: 'texto', escribible: false },
      mesero_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
      total_liquidado: { columna: 'total_centavos', conversion: 'dinero', escribible: false },
      usuario_liquido_id: {
        columna: 'empleado_liquida_id',
        conversion: 'texto',
        escribible: false,
      },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
    },
    derivados: {
      mesero_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      usuario_liquido_nombre: {
        tabla: 'empleados_visibles',
        porColumna: 'empleado_liquida_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  /**
   * La bitácora de sincronización. Su forma es correcta; lo que falta es el
   * trabajador que la consuma, y eso NO se construye en Fase 1. Hoy `intentos`
   * y `ultimo_intento_en` se escriben una vez y jamás se actualizan, y el botón
   * «Reintentar» es un `setTimeout` de 800 ms más un aviso.
   */
  IntegrationSyncLog: {
    tabla: 'bitacora_sincronizacion',
    rolesLectura: [...DIRECCION],
    escritura: 'directa',
    ordenPorOmision: '-created_date',
    campos: {
      ...AUTO,
      record_type: { columna: 'tipo_registro', conversion: 'texto' },
      record_id: { columna: 'registro_id', conversion: 'texto' },
      destination: { columna: 'destino', conversion: 'texto' },
      status: { columna: 'estado', conversion: 'texto' },
      attempts: { columna: 'intentos', conversion: 'entero' },
      last_attempt_at: { columna: 'ultimo_intento_en', conversion: 'fecha' },
      error_message: { columna: 'mensaje_error', conversion: 'texto' },
      file_url: { columna: 'archivo_url', conversion: 'texto' },
      sheet_tab: { columna: 'pestana_hoja', conversion: 'texto' },
      // A `jsonb`, no a `text`: si algún día se escribe, será consultable.
      payload_snapshot: { columna: 'payload', conversion: 'json' },
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
  rolesLectura: [...INVENTARIO],
  escritura: 'lectura',
  ordenPorOmision: '-created_date',
  filtroFijo: { referencia_tipo: 'orden' },
  campos: {
    ...soloAutomaticos(['id', 'created_date']),
    venta_id: { columna: 'referencia_id', conversion: 'texto', escribible: false },
    ingrediente_id: { columna: 'insumo_id', conversion: 'texto', escribible: false },
    // Sus nombres. El signo: el ledger guarda las salidas en negativo, y esta
    // vista es «lo consumido», que su pantalla enseña en positivo.
    cantidad_total_descontada: { columna: 'cantidad', conversion: 'decimal', escribible: false },
    unidad_base: { columna: 'unidad', conversion: 'texto', escribible: false },
    costo_unitario_snapshot: {
      columna: 'costo_unitario_centavos',
      conversion: 'dinero',
      escribible: false,
    },
  },
  derivados: {
    ingrediente_nombre: {
      tabla: 'insumos',
      porColumna: 'insumo_id',
      columna: 'nombre',
      conversion: 'texto',
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
