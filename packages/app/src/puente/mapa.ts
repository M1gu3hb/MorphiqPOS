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
/**
 * Quién ve la libreta del fiado.
 *
 * El cajero SÍ: es quien cobra el abono y quien tiene que poder decir «ya no
 * te puedo fiar» ANTES de que el producto salga, que es el momento en que la
 * función sirve de algo. Los costos siguen fuera de su alcance.
 */
const VE_FIADO = [...DIRECCION, 'cajero'] as const;
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
      imagen_url: {
        columna: 'imagen_url',
        conversion: 'texto',
        validacion: 'url_http',
        publico: true,
      },
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
      estacion_preparacion_id: { columna: 'estacion_preparacion_id', conversion: 'texto' },
      activo: { columna: 'activa', conversion: 'booleano' },
    },
    derivados: {
      estacion_preparacion_nombre: {
        tabla: 'estaciones_preparacion',
        porColumna: 'estacion_preparacion_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      estacion_preparacion_color: {
        tabla: 'estaciones_preparacion',
        porColumna: 'estacion_preparacion_id',
        columna: 'color',
        conversion: 'texto',
      },
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
      satisfaccion_origen: {
        columna: 'satisfaccion_score',
        conversion: 'texto',
        escribible: false,
        constante: 'portal_qr',
      },
    },
    derivados: {
      // La propina vive en `pagos`, separada de la venta. La vista 057 agrega
      // únicamente pagos confirmados y mantiene `ordenes.total_centavos` como
      // venta real, sin inflarla con dinero de los meseros.
      propina_monto: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'propina_monto_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
      propina_efectivo: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'propina_efectivo_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
      propina_tarjeta: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'propina_tarjeta_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
      propina_transferencia: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'propina_transferencia_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
      total_cobrado_con_propina: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'total_cobrado_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
      metodo_pago: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'metodo_pago',
        conversion: 'texto',
        rolesLectura: [...CAJA],
      },
      monto_efectivo: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'monto_efectivo_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
      monto_tarjeta: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'monto_tarjeta_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
      monto_transferencia: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'monto_transferencia_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
      cambio: {
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
        columna: 'cambio_centavos',
        conversion: 'dinero',
        rolesLectura: [...CAJA],
      },
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
    calculados: {
      fecha_apertura: {
        formula: 'fechaDeCreacion',
        conversion: 'fecha',
      },
      // No se guarda un segundo estado que pueda desincronizarse: la presencia
      // de la liquidación asociada es la única verdad.
      propina_liquidada: {
        rolesLectura: [...DIRECCION],
        formula: 'propinaLiquidada',
        conversion: 'booleano',
      },
      satisfaccion_label: {
        formula: 'etiquetaSatisfaccion',
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

  // ── Salón: qué le pasó a una cuenta y a una mesa (F-302, F-303, F-305, F-321,
  // F-324) ──────────────────────────────────────────────────────────────────
  //
  // Las cinco entran por `lectura`: son ledgers y vistas, y lo que las escribe es
  // un comando transaccional. Declararlas `comando` en vez de `lectura` daría el
  // mismo resultado hoy —el puente rechaza la escritura igual— y mentiría sobre
  // lo que son: `movimientos_cuenta` y `eventos_mesa` son INMUTABLES, no
  // «escribibles por comando».
  MovimientoCuenta: {
    tabla: 'movimientos_cuenta',
    rolesLectura: [...CAJA],
    escritura: 'lectura',
    ordenPorOmision: '-created_date',
    campos: {
      ...soloAutomaticos(['id', 'created_date']),
      tipo: { columna: 'tipo', conversion: 'texto', escribible: false },
      venta_origen_id: { columna: 'orden_origen_id', conversion: 'texto', escribible: false },
      venta_destino_id: { columna: 'orden_destino_id', conversion: 'texto', escribible: false },
      mesa_origen_id: { columna: 'mesa_origen_id', conversion: 'texto', escribible: false },
      mesa_destino_id: { columna: 'mesa_destino_id', conversion: 'texto', escribible: false },
      lineas: { columna: 'lineas', conversion: 'json', escribible: false },
      motivo: { columna: 'motivo', conversion: 'texto', escribible: false },
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

  UnionMesa: {
    tabla: 'uniones_mesa',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'lectura',
    ordenPorOmision: '-abierta_en',
    campos: {
      ...soloAutomaticos(['id']),
      mesa_principal_id: { columna: 'mesa_principal_id', conversion: 'texto', escribible: false },
      venta_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      abierta_en: { columna: 'abierta_en', conversion: 'fecha', escribible: false },
      cerrada_en: { columna: 'cerrada_en', conversion: 'fecha', escribible: false },
      usuario_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
    },
  },

  EventoMesa: {
    tabla: 'eventos_mesa',
    // El ledger del salón es un dato de DIRECCIÓN: es con lo que se decide
    // cuánta gente contratar el viernes. Un mesero no necesita el histórico de
    // transiciones para atender su mesa, y dárselo sólo agranda la superficie.
    rolesLectura: [...DIRECCION],
    escritura: 'lectura',
    ordenPorOmision: '-ocurrido_en',
    campos: {
      ...soloAutomaticos(['id']),
      mesa_id: { columna: 'mesa_id', conversion: 'texto', escribible: false },
      venta_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      estado_anterior: { columna: 'estado_anterior', conversion: 'texto', escribible: false },
      estado_nuevo: { columna: 'estado_nuevo', conversion: 'texto', escribible: false },
      personas: { columna: 'personas', conversion: 'entero', escribible: false },
      usuario_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
      ocurrido_en: { columna: 'ocurrido_en', conversion: 'fecha', escribible: false },
    },
  },

  OcupacionMesa: {
    tabla: 'ocupacion_mesas',
    rolesLectura: [...DIRECCION],
    escritura: 'lectura',
    ordenPorOmision: '-inicio',
    campos: {
      // `<mesa_id>:<ciclo>`, compuesto en la vista: una consulta agrupada no
      // tiene clave propia y el puente exige que toda entidad traiga `id`.
      id: { columna: 'id', conversion: 'texto', escribible: false },
      mesa_id: { columna: 'mesa_id', conversion: 'texto', escribible: false },
      venta_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      personas: { columna: 'personas', conversion: 'entero', escribible: false },
      inicio: { columna: 'inicio', conversion: 'fecha', escribible: false },
      // Nulo mientras la mesa sigue ocupada. Quien promedie tiene que filtrarlo,
      // y está dicho también en el comentario de la vista en la 072.
      fin: { columna: 'fin', conversion: 'fecha', escribible: false },
      minutos_ocupada: { columna: 'minutos_ocupada', conversion: 'entero', escribible: false },
      minutos_hasta_cuenta: {
        columna: 'minutos_hasta_cuenta',
        conversion: 'entero',
        escribible: false,
      },
    },
  },

  ConsumoInterno: {
    tabla: 'consumos_internos',
    rolesLectura: [...DIRECCION],
    escritura: 'comando',
    ordenPorOmision: '-created_date',
    campos: {
      ...soloAutomaticos(['id', 'created_date']),
      tipo: { columna: 'tipo', conversion: 'texto', escribible: false },
      venta_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      producto_nombre: { columna: 'producto_nombre', conversion: 'texto', escribible: false },
      cantidad: { columna: 'cantidad', conversion: 'decimal', escribible: false },
      unidad: { columna: 'unidad', conversion: 'texto', escribible: false },
      // El costo es MARGEN: la regla 12 lo cierra a quien ve lo que el negocio
      // gana, y un consumo interno es exactamente eso — lo que costó regalarlo.
      costo_centavos: {
        rolesLectura: [...VE_MARGENES],
        columna: 'costo_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      motivo: { columna: 'motivo', conversion: 'texto', escribible: false },
      usuario_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
    },
  },

  Cliente: {
    tabla: 'clientes',
    // F-040 · La tabla existe desde la 003 con saldo y límite de crédito, y
    // NUNCA estuvo declarada aquí: no había pantalla, ni comandos, ni nada. El
    // fiado de F-254 escribe contra ella, así que sin esta entrada el tendero
    // podía abonar y no podía ver a quién.
    rolesLectura: [...VE_FIADO],
    escritura: 'comando',
    ordenPorOmision: 'nombre',
    campos: {
      ...soloAutomaticos(['id']),
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      telefono: { columna: 'telefono', conversion: 'texto', escribible: false },
      correo: { columna: 'correo', conversion: 'texto', escribible: false },
      total_visitas: { columna: 'total_visitas', conversion: 'entero', escribible: false },
      ultima_visita: { columna: 'ultima_visita', conversion: 'fecha', escribible: false },
      saldo_pendiente_centavos: {
        columna: 'saldo_pendiente_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      limite_credito_centavos: {
        columna: 'limite_credito_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      activo: { columna: 'activo', conversion: 'booleano', escribible: false },
    },
  },

  Profesional: {
    tabla: 'profesionales',
    // La agenda entera se lee por columna y por color: si el mostrador no puede
    // leer quién atiende, no hay pantalla que pintar.
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'comando',
    ordenPorOmision: 'orden_agenda',
    campos: {
      ...soloAutomaticos(['id']),
      nombre_completo: { columna: 'nombre_completo', conversion: 'texto', escribible: false },
      nombre_corto: { columna: 'nombre_corto', conversion: 'texto', escribible: false },
      foto_url: { columna: 'foto_url', conversion: 'texto', escribible: false },
      nivel: { columna: 'nivel', conversion: 'texto', escribible: false },
      color_agenda: { columna: 'color_agenda', conversion: 'texto', escribible: false },
      orden_agenda: { columna: 'orden_agenda', conversion: 'entero', escribible: false },
      activo: { columna: 'activo', conversion: 'booleano', escribible: false },
      // Con qué trato trabaja y con qué regla cobra lo ve sólo la DIRECCIÓN:
      // es la conversación más delicada del salón y no se tiene en la pantalla
      // de recepción.
      tipo_relacion: {
        columna: 'tipo_relacion',
        conversion: 'texto',
        escribible: false,
        rolesLectura: [...DIRECCION],
      },
      regla_comision_id: {
        columna: 'regla_comision_id',
        conversion: 'texto',
        escribible: false,
        rolesLectura: [...DIRECCION],
      },
    },
  },

  Cita: {
    tabla: 'citas',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'comando',
    ordenPorOmision: 'agendada_para',
    campos: {
      ...soloAutomaticos(['id']),
      folio: { columna: 'folio', conversion: 'texto', escribible: false },
      cliente_id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      origen: { columna: 'origen', conversion: 'texto', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      agendada_para: { columna: 'agendada_para', conversion: 'fecha', escribible: false },
      llego_en: { columna: 'llego_en', conversion: 'fecha', escribible: false },
      inicio_real: { columna: 'inicio_real', conversion: 'fecha', escribible: false },
      fin_real: { columna: 'fin_real', conversion: 'fecha', escribible: false },
      orden_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      es_rehacer: { columna: 'es_rehacer', conversion: 'booleano', escribible: false },
      es_cortesia: { columna: 'es_cortesia', conversion: 'booleano', escribible: false },
      motivo_cancelacion: { columna: 'motivo_cancelacion', conversion: 'texto', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
    },
  },

  CitaServicio: {
    tabla: 'cita_servicios',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'comando',
    // Por precio y no por hora: el rango vive en columnas `tstzrange` que el
    // puente no expone —no sabe leerlas— y ordenar por algo que no viaja
    // dejaría a la pantalla sin forma de reproducir el orden.
    ordenPorOmision: 'precio_centavos',
    campos: {
      ...soloAutomaticos(['id']),
      cita_id: { columna: 'cita_id', conversion: 'texto', escribible: false },
      servicio_id: { columna: 'servicio_id', conversion: 'texto', escribible: false },
      profesional_id: { columna: 'profesional_id', conversion: 'texto', escribible: false },
      precio_centavos: { columna: 'precio_centavos', conversion: 'dinero', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      cerrado_en: { columna: 'cerrado_en', conversion: 'fecha', escribible: false },
      orden_linea_id: { columna: 'orden_linea_id', conversion: 'texto', escribible: false },
    },
    /**
     * LOS TRES NOMBRES que sus lectores piden y no estaban.
     *
     * `HistorialDeLaClienta` y `MiDia` leen `fecha`, `servicio_nombre` y
     * `profesional_nombre` de cada servicio de cita, y ninguno era un campo: las
     * dos pantallas pintaban la fecha vacía y «—» en el servicio con todo bien
     * puesto en la base. Son tres `left join` de una tabla cada uno, que es
     * exactamente lo que los derivados del puente saben hacer.
     */
    derivados: {
      // La fecha vive en la CITA, no en su servicio: el rango del servicio es un
      // `tstzrange` que el puente no sabe leer.
      fecha: {
        tabla: 'citas',
        porColumna: 'cita_id',
        columna: 'agendada_para',
        conversion: 'fecha',
      },
      servicio_nombre: {
        tabla: 'productos',
        porColumna: 'servicio_id',
        columna: 'nombre',
        conversion: 'texto',
      },
      // El corto, que es el que cabe en una columna de agenda.
      profesional_nombre: {
        tabla: 'profesionales',
        porColumna: 'profesional_id',
        columna: 'nombre_corto',
        conversion: 'texto',
      },
    },
  },

  /**
   * EL EXPEDIENTE DE BELLEZA (F-153).
   *
   * ── Por qué esta entidad tenía que existir ────────────────────────────────
   * Porque de aquí sale la BANDERA DE ALERGIA de la agenda, y un error ahí no es
   * un descuadre: es una quemadura. `AgendaDelDia` pinta un triángulo en la
   * esquina del bloque y `HistorialDeLaClienta` enseña el texto completo antes de
   * tocar a la clienta; las dos leían una entidad que el puente no tenía.
   *
   * No es «notas del cliente»: se abre EN CADA VISITA y las alergias son columna
   * a propósito —una alergia dentro de un jsonb es una alergia que nadie
   * consulta—.
   */
  ExpedienteBelleza: {
    tabla: 'expedientes_belleza',
    // Lo ve quien atiende, que es quien tiene las manos en la cabeza de alguien.
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'comando',
    ordenPorOmision: '-abierto_en',
    campos: {
      /**
       * LA CLAVE ES LA CLIENTA: hay UN expediente por clienta, no una fila por
       * visita, y la tabla no tiene columna `id` propia.
       *
       * Se sirve como `id` porque el contrato del puente exige que toda entidad
       * traiga uno —su frontend lo lee siempre— y porque un segundo campo sobre
       * la misma columna está prohibido, también con razón: dos nombres para una
       * columna es cómo uno pisa al otro al guardar. Así que quien busque el
       * expediente de una clienta filtra por `id`, que aquí ES el de la clienta.
       */
      id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      alergias: { columna: 'alergias', conversion: 'texto', escribible: false },
      antecedentes: { columna: 'antecedentes', conversion: 'texto', escribible: false },
      como_llego: { columna: 'como_llego', conversion: 'texto', escribible: false },
      que_busca: { columna: 'que_busca', conversion: 'texto', escribible: false },
      tipo_cabello: { columna: 'tipo_cabello', conversion: 'texto', escribible: false },
      porcentaje_canas: { columna: 'porcentaje_canas', conversion: 'entero', escribible: false },
      ultimo_alisado_en: { columna: 'ultimo_alisado_en', conversion: 'dia', escribible: false },
      frecuencia_dias: { columna: 'frecuencia_dias', conversion: 'entero', escribible: false },
      abierto_en: { columna: 'abierto_en', conversion: 'fecha', escribible: false },
    },
  },

  /**
   * LA FÓRMULA APLICADA (F-154).
   *
   * De aquí sale el botón REPETIR: lo que de verdad se mezcló la vez pasada, con
   * su tono, su volumen y sus minutos. `CitaEnCurso` lo enseña como «la vez
   * pasada» —es lo primero que la estilista mira— y el historial lo lista por
   * visita. Ninguna de las dos lo tenía.
   *
   * `formula` viaja como JSON tal cual: es `{marca, tono, volumen, gramos,
   * minutos, notas}` y NO apunta al catálogo, porque una fórmula congelada tiene
   * que seguir leyéndose cuando la marca ya no se vende.
   */
  FormulaAplicada: {
    tabla: 'formulas_aplicadas',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'comando',
    // Por el NOMBRE del campo, no por el de la columna: es lo que el contrato
    // del puente exige y lo que la pantalla puede reproducir.
    ordenPorOmision: '-fecha',
    campos: {
      ...soloAutomaticos(['id']),
      cliente_id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      cita_servicio_id: { columna: 'cita_servicio_id', conversion: 'texto', escribible: false },
      servicio_id: { columna: 'servicio_id', conversion: 'texto', escribible: false },
      profesional_id: { columna: 'profesional_id', conversion: 'texto', escribible: false },
      formula: { columna: 'formula', conversion: 'json', escribible: false },
      minutos: { columna: 'minutos_procesado', conversion: 'entero', escribible: false },
      resultado: { columna: 'resultado', conversion: 'texto', escribible: false },
      // `fecha` y no `aplicada_en`: es el nombre con el que las dos pantallas la
      // leen y el que usan para ordenar.
      fecha: { columna: 'aplicada_en', conversion: 'fecha', escribible: false },
    },
    derivados: {
      servicio: {
        tabla: 'productos',
        porColumna: 'servicio_id',
        columna: 'nombre',
        conversion: 'texto',
      },
    },
  },

  ReglaComision: {
    tabla: 'reglas_comision',
    // Las cinco preguntas del trato de cada quien. Sólo la DIRECCIÓN.
    rolesLectura: [...DIRECCION],
    escritura: 'comando',
    ordenPorOmision: '-vigente_desde',
    campos: {
      ...soloAutomaticos(['id']),
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      version: { columna: 'version', conversion: 'entero', escribible: false },
      esquema: { columna: 'esquema', conversion: 'texto', escribible: false },
      tasa_servicio_bp: {
        columna: 'tasa_servicio_bp',
        conversion: 'puntos_base',
        escribible: false,
      },
      tasa_producto_bp: {
        columna: 'tasa_producto_bp',
        conversion: 'puntos_base',
        escribible: false,
      },
      base: { columna: 'base', conversion: 'texto', escribible: false },
      sobre_iva: { columna: 'sobre_iva', conversion: 'booleano', escribible: false },
      material: { columna: 'material', conversion: 'texto', escribible: false },
      reparto: { columna: 'reparto', conversion: 'texto', escribible: false },
      rehacer_paga: { columna: 'rehacer_paga', conversion: 'booleano', escribible: false },
      escalones: { columna: 'escalones', conversion: 'json', escribible: false },
      vigente_desde: { columna: 'vigente_desde', conversion: 'dia', escribible: false },
      vigente_hasta: { columna: 'vigente_hasta', conversion: 'dia', escribible: false },
    },
  },

  ComisionCausada: {
    tabla: 'comisiones_causadas',
    // Cada quien ve lo suyo por el filtro de la consulta; la dirección lo ve
    // todo. Lo que NO se puede es esconderlo: una comisión que la estilista no
    // puede leer es el pleito del domingo con otro nombre.
    rolesLectura: [...DIRECCION, 'mesero', 'cajero'],
    escritura: 'comando',
    ordenPorOmision: '-causada_en',
    campos: {
      ...soloAutomaticos(['id']),
      profesional_id: { columna: 'profesional_id', conversion: 'texto', escribible: false },
      orden_linea_id: { columna: 'orden_linea_id', conversion: 'texto', escribible: false },
      cita_servicio_id: { columna: 'cita_servicio_id', conversion: 'texto', escribible: false },
      regla_id: { columna: 'regla_id', conversion: 'texto', escribible: false },
      regla_version: { columna: 'regla_version', conversion: 'entero', escribible: false },
      tipo: { columna: 'tipo', conversion: 'texto', escribible: false },
      base_centavos: { columna: 'base_centavos', conversion: 'dinero', escribible: false },
      tasa_bp: { columna: 'tasa_bp', conversion: 'puntos_base', escribible: false },
      monto_centavos: { columna: 'monto_centavos', conversion: 'dinero', escribible: false },
      // El motivo de la contrapartida viaja: «− $50, ticket 3471 cancelado» es
      // lo único que hace entendible que el número baje.
      motivo: { columna: 'motivo', conversion: 'texto', escribible: false },
      liquidacion_id: { columna: 'liquidacion_id', conversion: 'texto', escribible: false },
      causada_en: { columna: 'causada_en', conversion: 'fecha', escribible: false },
    },
  },

  Liquidacion: {
    tabla: 'liquidaciones',
    rolesLectura: [...DIRECCION, 'mesero'],
    escritura: 'comando',
    ordenPorOmision: '-periodo_hasta',
    campos: {
      ...soloAutomaticos(['id']),
      profesional_id: { columna: 'profesional_id', conversion: 'texto', escribible: false },
      periodo_desde: { columna: 'periodo_desde', conversion: 'dia', escribible: false },
      periodo_hasta: { columna: 'periodo_hasta', conversion: 'dia', escribible: false },
      // Dos campos, nunca uno: la propina no es del salón.
      comision_centavos: { columna: 'comision_centavos', conversion: 'dinero', escribible: false },
      propina_centavos: { columna: 'propina_centavos', conversion: 'dinero', escribible: false },
      renta_centavos: { columna: 'renta_centavos', conversion: 'dinero', escribible: false },
      total_centavos: { columna: 'total_centavos', conversion: 'dinero', escribible: false },
      movimiento_caja_id: { columna: 'movimiento_caja_id', conversion: 'texto', escribible: false },
      pagada_en: { columna: 'pagada_en', conversion: 'fecha', escribible: false },
    },
  },

  Obra: {
    tabla: 'obras',
    // F-639 · La obra se CIERRA, nunca se borra: sus remisiones se consultan
    // años después, y el contratista las pide para su contabilidad de obra.
    rolesLectura: [...VE_FIADO],
    escritura: 'comando',
    ordenPorOmision: 'nombre',
    campos: {
      ...soloAutomaticos(['id']),
      cliente_id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      direccion: { columna: 'direccion', conversion: 'texto', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      limite_centavos: { columna: 'limite_centavos', conversion: 'dinero', escribible: false },
      abierta_en: { columna: 'abierta_en', conversion: 'fecha', escribible: false },
      cerrada_en: { columna: 'cerrada_en', conversion: 'fecha', escribible: false },
    },
  },

  AutorizadoCuenta: {
    tabla: 'autorizados_cuenta',
    // El mostrador TIENE que poder leerla: el aviso de «no está en la lista»
    // sirve antes de despachar, o no sirve.
    rolesLectura: [...VE_FIADO],
    escritura: 'comando',
    ordenPorOmision: 'nombre',
    campos: {
      ...soloAutomaticos(['id']),
      cliente_id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      obra_id: { columna: 'obra_id', conversion: 'texto', escribible: false },
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      telefono: { columna: 'telefono', conversion: 'texto', escribible: false },
      // La identificación que enseñó al darse de alta la ve la DIRECCIÓN, no el
      // mostrador: para despachar basta el nombre y la foto.
      identificacion: {
        columna: 'identificacion',
        conversion: 'texto',
        escribible: false,
        rolesLectura: [...DIRECCION],
      },
      foto_url: { columna: 'foto_url', conversion: 'texto', escribible: false },
      tope_por_salida_centavos: {
        columna: 'tope_por_salida_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      activo: { columna: 'activo', conversion: 'booleano', escribible: false },
      dado_de_baja_en: { columna: 'dado_de_baja_en', conversion: 'fecha', escribible: false },
    },
  },

  Remision: {
    tabla: 'remisiones',
    rolesLectura: [...VE_FIADO],
    escritura: 'comando',
    ordenPorOmision: '-entregada_en',
    campos: {
      ...soloAutomaticos(['id']),
      orden_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      folio: { columna: 'folio', conversion: 'texto', escribible: false },
      cliente_id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      obra_id: { columna: 'obra_id', conversion: 'texto', escribible: false },
      autorizado_id: { columna: 'autorizado_id', conversion: 'texto', escribible: false },
      nombre_firmante: { columna: 'nombre_firmante', conversion: 'texto', escribible: false },
      // EL dato de la impugnación. Se expone porque la conversación de cobro se
      // tiene mirando la pantalla, no el registro de auditoría.
      autorizado_estaba_en_lista: {
        columna: 'autorizado_estaba_en_lista',
        conversion: 'booleano',
        escribible: false,
      },
      firma_url: { columna: 'firma_url', conversion: 'texto', escribible: false },
      importe_centavos: { columna: 'importe_centavos', conversion: 'dinero', escribible: false },
      saldo_documento_centavos: {
        columna: 'saldo_documento_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      entregada_en: { columna: 'entregada_en', conversion: 'fecha', escribible: false },
      entregada_por: { columna: 'entregada_por', conversion: 'texto', escribible: false },
    },
  },

  Ubicacion: {
    tabla: 'ubicaciones',
    // La lee quien vende: la ubicación existe para encontrar la pieza, sesenta
    // veces al día. Esconderla del cajero la deja sin usuario.
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'comando',
    ordenPorOmision: 'orden_recorrido',
    campos: {
      ...soloAutomaticos(['id']),
      almacen_id: { columna: 'almacen_id', conversion: 'texto', escribible: false },
      codigo: { columna: 'codigo', conversion: 'texto', escribible: false },
      descripcion: { columna: 'descripcion', conversion: 'texto', escribible: false },
      zona_id: { columna: 'zona_id', conversion: 'texto', escribible: false },
      orden_recorrido: { columna: 'orden_recorrido', conversion: 'entero', escribible: false },
      activa: { columna: 'activa', conversion: 'booleano', escribible: false },
    },
  },

  ProductoAtributo: {
    tabla: 'producto_atributos',
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'comando',
    ordenPorOmision: 'clave',
    campos: {
      ...soloAutomaticos(['id']),
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      clave: { columna: 'clave', conversion: 'texto', escribible: false },
      valor_texto: { columna: 'valor_texto', conversion: 'texto', escribible: false },
      // En MICRÓMETROS, y por eso entero: un cuarto de pulgada es 6350, no 6.35.
      valor_normalizado: { columna: 'valor_normalizado', conversion: 'entero', escribible: false },
      // Lo que tecleó la persona. Viaja porque es lo que la pantalla vuelve a
      // mostrar: reconstruir la fracción desde el normalizado es ambiguo.
      valor_original: { columna: 'valor_original', conversion: 'texto', escribible: false },
    },
  },

  /**
   * EL MATERIAL QUE SE VENDE CORTADO (F-145, F-150).
   *
   * ── Por qué esta entidad tenía que existir ────────────────────────────────
   * `ferreteria/CorteDeMaterial.tsx` se hidrata de aquí y de `PiezaDeMaterial`, y
   * **ninguna de las dos estaba en el mapa**: el puente contestaba
   * `PUENTE_ENTIDAD_DESCONOCIDA` y la pantalla caía en su estado vacío. La
   * función que distingue a una ferretería de una tiendita —cortar— no tenía por
   * dónde entrar.
   *
   * ── En unidades de VENTA, no en base ─────────────────────────────────────
   * La vista `materiales_continuos` (171) ya divide: `desperdicioTipico` y
   * `umbralRetazo` llegan en metros con decimales, que es lo que la pantalla
   * teclea y compara. En base serían 2 000 y 30 000, y el aviso de «retazo
   * chico» se dispararía siempre.
   */
  MaterialContinuo: {
    tabla: 'materiales_continuos',
    // Corta quien despacha y quien está en el almacén; el precio de remate lo
    // decide quien ve márgenes, y eso se filtra por campo más abajo.
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'lectura',
    ordenPorOmision: 'nombre',
    campos: {
      id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      unidad: { columna: 'unidad_venta', conversion: 'texto', escribible: false },
      tipoCorte: { columna: 'tipo_corte', conversion: 'texto', escribible: false },
      precioCentavos: { columna: 'precio_venta_centavos', conversion: 'entero', escribible: false },
      costoCentavos: {
        rolesLectura: [...VE_MARGENES],
        columna: 'costo_unitario_centavos',
        conversion: 'entero',
        escribible: false,
      },
      desperdicioTipico: { columna: 'merma_tipica', conversion: 'decimal', escribible: false },
      umbralRetazo: { columna: 'umbral_retazo', conversion: 'decimal', escribible: false },
      // Sugerencia, no precio: lo lee quien puede decidir rematar.
      precioRemateCentavos: {
        rolesLectura: [...VE_MARGENES],
        columna: 'precio_remate_centavos',
        conversion: 'entero',
        escribible: false,
      },
    },
  },

  /**
   * LOS ROLLOS ABIERTOS, con su etiqueta (F-145).
   *
   * Un RETAZO cuenta como abierto: se puede cortar de él y conviene gastarlo
   * antes que abrir otro rollo. `iguales` es siempre 1 porque los rollos cerrados
   * no llevan identidad a propósito (migración 113), y el sistema no sabe si los
   * 250 m que no están en piezas son dos rollos de 125 o cinco de 50.
   */
  PiezaDeMaterial: {
    tabla: 'piezas_de_material',
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'comando',
    // La más chica primero: el objetivo es CERRAR piezas, no abrirlas.
    ordenPorOmision: 'restante',
    campos: {
      id: { columna: 'id', conversion: 'texto', escribible: false },
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      folio: { columna: 'folio', conversion: 'texto', escribible: false },
      abierta: { columna: 'abierta', conversion: 'booleano', escribible: false },
      restante: { columna: 'restante', conversion: 'decimal', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      iguales: { columna: 'iguales', conversion: 'entero', escribible: false },
    },
  },

  /**
   * LA CAJA DE UNA FERRETERÍA (F-140).
   *
   * ── Por qué esta entidad tenía que existir ────────────────────────────────
   * `ferreteria/Caja.tsx` se hidrataba de `Venta` y filtraba por
   * `estado: 'pendiente_cobro'`, que **no existe en el `check` de
   * `ordenes.estado`**: su lista de notas pendientes no podía tener una fila
   * nunca, y la caja enseñaba «La caja está al día» con el mostrador lleno. Los
   * otros once campos que la pantalla lee tampoco estaban en `Venta`, así que
   * cada renglón habría salido «—» incluso con el estado arreglado.
   *
   * ── Por qué una vista y no más campos en `Venta` ──────────────────────────
   * Porque lo que la caja lista no son órdenes: son NOTAS DE MOSTRADOR, con su
   * folio, su caducidad y su propio estado. Y porque «pagada pero sin entregar»
   * —el descuadre que hace que alguien entregue dos veces el mismo material— no
   * se puede ver mirando `ordenes`: hace falta `notas_mostrador.entregada_en`.
   *
   * ── Y por qué el dinero va en CENTAVOS ───────────────────────────────────
   * Porque esta pantalla es nueva y cuenta en centavos de punta a punta, como
   * `MaterialMostrador`. `dinero` divide por cien para el frontend heredado, y
   * un total dividido dos veces son sesenta pesos en vez de seis mil.
   */
  NotaDeCaja: {
    tabla: 'notas_de_caja',
    // El cajero cobra y el mostradorista pregunta «¿ya pagaron la mía?». Los dos.
    rolesLectura: [...CAJA, 'mesero'],
    escritura: 'comando',
    ordenPorOmision: '-creada',
    campos: {
      // La clave es la ORDEN, no la nota: es lo que `venta.cobrar` recibe y con
      // lo que `DetalleVenta` filtra las partidas. La nota va aparte, para
      // `nota_mostrador.entregar`.
      id: { columna: 'id', conversion: 'texto', escribible: false },
      nota_id: { columna: 'nota_id', conversion: 'texto', escribible: false },
      codigo_caja: { columna: 'codigo_caja', conversion: 'texto', escribible: false },
      // `por_cobrar` · `pagada_sin_entregar` · `apartada` · `cancelada`. Lo
      // calcula la vista de los dos estados reales: el de la orden dice si entró
      // el dinero, el de la nota si salió el material.
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      cliente_nombre: { columna: 'cliente_nombre', conversion: 'texto', escribible: false },
      cliente_id: { columna: 'cliente_id', conversion: 'texto', escribible: false },
      obra: { columna: 'obra', conversion: 'texto', escribible: false },
      recoge_nombre: { columna: 'recoge_nombre', conversion: 'texto', escribible: false },
      recoge_autorizado: {
        columna: 'recoge_autorizado',
        conversion: 'booleano',
        escribible: false,
      },
      atendio: { columna: 'atendio', conversion: 'texto', escribible: false },
      creada: { columna: 'creada', conversion: 'fecha', escribible: false },
      vence: { columna: 'vence', conversion: 'fecha', escribible: false },
      totalCentavos: { columna: 'total_centavos', conversion: 'entero', escribible: false },
      // El saldo y el límite se repiten en la caja porque quien cobra es OTRA
      // persona: la decisión de dar crédito es suya, y el dato tiene que estar
      // delante de quien decide, no de quien decidió antes.
      saldoClienteCentavos: {
        rolesLectura: [...CAJA],
        columna: 'saldo_cliente_centavos',
        conversion: 'entero',
        escribible: false,
      },
      limiteClienteCentavos: {
        rolesLectura: [...CAJA],
        columna: 'limite_cliente_centavos',
        conversion: 'entero',
        escribible: false,
      },
    },
  },

  /**
   * EL ÍNDICE DEL MOSTRADOR DE UNA FERRETERÍA (F-150, F-152).
   *
   * ── Por qué esta entidad tenía que existir ────────────────────────────────
   * `ferreteria/Mostrador.tsx` y `ferreteria/Cotizacion.tsx` se hidratan de aquí,
   * y **no estaba en el mapa**: el puente contestaba
   * `PUENTE_ENTIDAD_DESCONOCIDA`, las dos pantallas se comían el error y se
   * quedaban sin un solo material. Sin índice no hay resultados, sin resultados
   * no hay partidas, y «Mandar a caja» no se encendía nunca: una ferretería no
   * podía vender NADA por su pantalla.
   *
   * ── Los nombres son LOS DE LA PANTALLA ───────────────────────────────────
   * `precioCentavos`, `costoCentavos`, `existencia` en camelCase y en CENTAVOS,
   * porque es lo que `buscar-material.ts` y `Cotizacion.tsx` leen. Por eso la
   * conversión del dinero es `entero` y no `dinero`: `dinero` divide por cien
   * para el frontend heredado, y estas dos pantallas son nuevas y cuentan en
   * centavos. Un precio dividido dos veces son diecinueve pesos en vez de mil
   * novecientos.
   *
   * ── Y el costo va aparte ─────────────────────────────────────────────────
   * `costoCentavos` sólo lo lee quien ve márgenes. Un mostradorista no tiene por
   * qué saber lo que el negocio paga, y la cotización que lo usa la hace quien
   * decide el precio.
   */
  MaterialMostrador: {
    tabla: 'materiales_mostrador',
    // La lee quien vende en el pasillo y quien cotiza. Es el catálogo con su
    // ubicación: esconderlo del cajero lo deja sin usuario (igual que `Ubicacion`).
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'lectura',
    ordenPorOmision: 'nombre',
    campos: {
      // La clave es el PRODUCTO: la vista no tiene `id` propio, y el
      // identificador que las partidas y el corte usan es el del producto.
      id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      sku: { columna: 'sku', conversion: 'texto', escribible: false },
      codigo_barras: { columna: 'codigo_barras', conversion: 'texto', escribible: false },
      // Los tres de display, con su valor ORIGINAL: el mostradorista teclea
      // `1/4` y espera leer `1/4"`, no `6350`.
      medida: { columna: 'medida', conversion: 'texto', escribible: false },
      acabado: { columna: 'acabado', conversion: 'texto', escribible: false },
      marca: { columna: 'marca', conversion: 'texto', escribible: false },
      linea: { columna: 'linea', conversion: 'texto', escribible: false },
      // F-152: sin la ubicación, el resultado de la búsqueda no termina la venta
      // —el mostradorista sabe que lo hay y no dónde está—.
      ubicacion: { columna: 'ubicacion', conversion: 'texto', escribible: false },
      unidad: { columna: 'unidad_venta', conversion: 'texto', escribible: false },
      precioCentavos: {
        columna: 'precio_venta_centavos',
        conversion: 'entero',
        escribible: false,
      },
      costoCentavos: {
        rolesLectura: [...VE_MARGENES],
        columna: 'costo_unitario_centavos',
        conversion: 'entero',
        escribible: false,
      },
      // La existencia es la proyección del ledger, EN VIVO: la vista la lee de
      // `existencias_por_insumo` en cada consulta y no de una materializada, que
      // diría que hay seis tramos de tubo cuando quedan dos.
      existencia: { columna: 'existencia', conversion: 'decimal', escribible: false },
    },
  },

  PiezaAbierta: {
    tabla: 'piezas_abiertas',
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'comando',
    ordenPorOmision: 'medida_restante_base',
    campos: {
      ...soloAutomaticos(['id']),
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      almacen_id: { columna: 'almacen_id', conversion: 'texto', escribible: false },
      folio: { columna: 'folio', conversion: 'texto', escribible: false },
      medida_restante_base: {
        columna: 'medida_restante_base',
        conversion: 'entero',
        escribible: false,
      },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      precio_remate_centavos: {
        columna: 'precio_remate_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      ubicacion_id: { columna: 'ubicacion_id', conversion: 'texto', escribible: false },
      abierta_en: { columna: 'abierta_en', conversion: 'fecha', escribible: false },
    },
  },

  Redondeo: {
    tabla: 'redondeos',
    // Lo lee quien cuadra el cajón: es la explicación de por qué el arqueo no
    // da exactamente lo que dice la venta.
    rolesLectura: [...CAJA],
    escritura: 'comando',
    ordenPorOmision: '-created_at',
    campos: {
      ...soloAutomaticos(['id']),
      orden_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      tipo: { columna: 'tipo', conversion: 'texto', escribible: false },
      importe_centavos: { columna: 'importe_centavos', conversion: 'dinero', escribible: false },
      producto_especie_id: {
        columna: 'producto_especie_id',
        conversion: 'texto',
        escribible: false,
      },
      movimiento_caja_id: { columna: 'movimiento_caja_id', conversion: 'texto', escribible: false },
      sesion_caja_id: { columna: 'sesion_caja_id', conversion: 'texto', escribible: false },
      empleado_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
      created_at: { columna: 'created_at', conversion: 'fecha', escribible: false },
    },
  },

  Presentacion: {
    tabla: 'producto_presentaciones',
    // El precio de una presentación es público en el mostrador: el six tiene su
    // etiqueta en el anaquel. Esconderlo del cajero sería esconderle lo que va a
    // cobrar.
    rolesLectura: [...TODOS_LOS_ROLES],
    escritura: 'comando',
    ordenPorOmision: 'factor',
    campos: {
      ...soloAutomaticos(['id']),
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      factor: { columna: 'factor', conversion: 'decimal', escribible: false },
      codigo_barras: { columna: 'codigo_barras', conversion: 'texto', escribible: false },
      sku: { columna: 'sku', conversion: 'texto', escribible: false },
      precio_venta_centavos: {
        columna: 'precio_venta_centavos',
        conversion: 'dinero',
        escribible: false,
      },
      es_base: { columna: 'es_base', conversion: 'booleano', escribible: false },
      es_venta_default: { columna: 'es_venta_default', conversion: 'booleano', escribible: false },
      es_compra_default: {
        columna: 'es_compra_default',
        conversion: 'booleano',
        escribible: false,
      },
      activa: { columna: 'activa', conversion: 'booleano', escribible: false },
    },
  },

  ZonaAnaquel: {
    tabla: 'zonas_anaquel',
    rolesLectura: [...INVENTARIO, 'cajero'],
    escritura: 'comando',
    // Por el recorrido físico de la tienda: contar saltando de la reja al
    // congelador y de vuelta es cómo se cuenta dos veces lo mismo.
    ordenPorOmision: 'orden',
    campos: {
      ...soloAutomaticos(['id']),
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      orden: { columna: 'orden', conversion: 'entero', escribible: false },
      dias_entre_conteos: {
        columna: 'dias_entre_conteos',
        conversion: 'entero',
        escribible: false,
      },
      ultimo_conteo_en: { columna: 'ultimo_conteo_en', conversion: 'fecha', escribible: false },
      activa: { columna: 'activa', conversion: 'booleano', escribible: false },
    },
  },

  /**
   * LO QUE SE CUENTA HOY (F-149).
   *
   * La vista `conteo_de_zona` (173) sirve los productos de UNA zona: la más
   * atrasada de la organización. La pantalla no elige —el encargado está de pie
   * frente al anaquel— y por eso `filas[0].zona` es el recorrido de hoy.
   *
   * `id` es el INSUMO y no el producto, porque es el insumo el que tiene zona y
   * el que `toma_conteos` cuenta (ver la 091: un insumo sin producto —el envase,
   * el granel— sería invisible para el recorrido si la zona colgara del producto).
   *
   * `esperado` se expone y la pantalla NO lo pinta hasta el resumen: contar a
   * ciegas es la condición que esa pantalla no puede romper. Se sirve porque el
   * resumen lo necesita sin un segundo viaje, con el encargado todavía de pie.
   */
  ConteoDeZona: {
    tabla: 'conteo_de_zona',
    // Cuenta quien está: en una tiendita es el cajero quien conoce el anaquel, y
    // exigir al encargado es cómo el conteo cíclico vuelve a ser una toma anual.
    rolesLectura: [...INVENTARIO, 'cajero'],
    escritura: 'comando',
    // Por el nombre: el recorrido dentro de una zona es alfabético porque el
    // anaquel no tiene un orden que la base conozca.
    ordenPorOmision: 'nombre',
    campos: {
      id: { columna: 'insumo_id', conversion: 'texto', escribible: false },
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      zona: { columna: 'zona', conversion: 'texto', escribible: false },
      diasSinContar: { columna: 'dias_sin_contar', conversion: 'entero', escribible: false },
      codigo: { columna: 'codigo', conversion: 'texto', escribible: false },
      piezasPorCaja: { columna: 'piezas_por_caja', conversion: 'decimal', escribible: false },
      esperado: { columna: 'esperado', conversion: 'decimal', escribible: false },
      costoCentavos: {
        rolesLectura: [...VE_COSTOS_DE_INSUMO],
        columna: 'costo_centavos',
        conversion: 'entero',
        escribible: false,
      },
    },
  },

  Conteo: {
    tabla: 'tomas_inventario',
    rolesLectura: [...INVENTARIO],
    escritura: 'comando',
    ordenPorOmision: '-iniciada_en',
    campos: {
      ...soloAutomaticos(['id']),
      almacen_id: { columna: 'almacen_id', conversion: 'texto', escribible: false },
      zona_id: { columna: 'zona_id', conversion: 'texto', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      iniciada_en: { columna: 'iniciada_en', conversion: 'fecha', escribible: false },
      cerrada_en: { columna: 'cerrada_en', conversion: 'fecha', escribible: false },
      empleado_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
    },
  },

  ConteoLinea: {
    tabla: 'toma_conteos',
    rolesLectura: [...INVENTARIO],
    escritura: 'comando',
    ordenPorOmision: '-contado_en',
    campos: {
      ...soloAutomaticos(['id']),
      conteo_id: { columna: 'toma_id', conversion: 'texto', escribible: false },
      insumo_id: { columna: 'insumo_id', conversion: 'texto', escribible: false },
      esperado: { columna: 'esperado', conversion: 'decimal', escribible: false },
      contado: { columna: 'contado', conversion: 'decimal', escribible: false },
      unidad: { columna: 'unidad', conversion: 'texto', escribible: false },
      // El crudo de lo que tecleó la persona. Se expone porque la discusión
      // «yo conté nueve cajas» se tiene mirando la pantalla, no el log.
      capturas: { columna: 'capturas', conversion: 'json', escribible: false },
      movimiento_ajuste_id: {
        columna: 'movimiento_ajuste_id',
        conversion: 'texto',
        escribible: false,
      },
      contado_en: { columna: 'contado_en', conversion: 'fecha', escribible: false },
      empleado_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
    },
  },

  EsquemaPropina: {
    tabla: 'esquemas_propina',
    rolesLectura: [...DIRECCION],
    escritura: 'comando',
    ordenPorOmision: '-vigente_desde',
    campos: {
      ...soloAutomaticos(['id']),
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      vigente_desde: { columna: 'vigente_desde', conversion: 'texto', escribible: false },
      vigente_hasta: { columna: 'vigente_hasta', conversion: 'texto', escribible: false },
      activo: { columna: 'activo', conversion: 'booleano', escribible: false },
    },
  },

  BeneficiarioPropina: {
    tabla: 'liquidacion_propina_beneficiarios',
    // Sólo dueño y administrador: un mesero no ve lo que se le liquidó a otro,
    // y ése es el pleito que F-242 viene a cerrar, no a alimentar.
    rolesLectura: ['dueno', 'administrador'],
    escritura: 'comando',
    ordenPorOmision: '-monto_centavos',
    campos: {
      ...soloAutomaticos(['id']),
      liquidacion_id: { columna: 'liquidacion_id', conversion: 'texto', escribible: false },
      usuario_id: { columna: 'empleado_id', conversion: 'texto', escribible: false },
      puesto: { columna: 'puesto', conversion: 'texto', escribible: false },
      puntos: { columna: 'puntos', conversion: 'decimal', escribible: false },
      monto_centavos: { columna: 'monto_centavos', conversion: 'dinero', escribible: false },
    },
  },

  TiempoPreparacion: {
    tabla: 'tiempos_preparacion',
    // Cocina SÍ lee esto: es su propio desempeño, no el margen del negocio.
    rolesLectura: [...PREPARACION],
    escritura: 'lectura',
    ordenPorOmision: '-arrancado_en',
    campos: {
      id: { columna: 'id', conversion: 'texto', escribible: false },
      pedido_id: { columna: 'comanda_id', conversion: 'texto', escribible: false },
      estacion_id: { columna: 'estacion_preparacion_id', conversion: 'texto', escribible: false },
      producto_id: { columna: 'producto_id', conversion: 'texto', escribible: false },
      producto_nombre: { columna: 'producto_nombre', conversion: 'texto', escribible: false },
      minutos_estimados: { columna: 'minutos_estimados', conversion: 'entero', escribible: false },
      minutos_reales: { columna: 'minutos_reales', conversion: 'entero', escribible: false },
      desviacion_bp: { columna: 'desviacion_bp', conversion: 'entero', escribible: false },
      arrancado_en: { columna: 'arrancado_en', conversion: 'fecha', escribible: false },
      listo_en: { columna: 'listo_en', conversion: 'fecha', escribible: false },
    },
  },

  EsperaMesa: {
    tabla: 'lista_espera',
    rolesLectura: [...OPERACION_RESTAURANTE],
    escritura: 'comando',
    ordenPorOmision: 'creada_en',
    campos: {
      ...soloAutomaticos(['id']),
      nombre: { columna: 'nombre', conversion: 'texto', escribible: false },
      // DATO PERSONAL. El mesero no lo necesita para sentar a nadie, y darle a
      // toda la sala el teléfono de quien espera agranda la superficie sin
      // ninguna ganancia operativa.
      telefono: {
        rolesLectura: [...CAJA],
        columna: 'telefono',
        conversion: 'texto',
        escribible: false,
      },
      personas: { columna: 'personas', conversion: 'entero', escribible: false },
      estado: { columna: 'estado', conversion: 'texto', escribible: false },
      mesa_id: { columna: 'mesa_id', conversion: 'texto', escribible: false },
      venta_id: { columna: 'orden_id', conversion: 'texto', escribible: false },
      espera_estimada_minutos: {
        columna: 'espera_estimada_minutos',
        conversion: 'entero',
        escribible: false,
      },
      creada_en: { columna: 'creada_en', conversion: 'fecha', escribible: false },
      avisada_en: { columna: 'avisada_en', conversion: 'fecha', escribible: false },
      sentada_en: { columna: 'sentada_en', conversion: 'fecha', escribible: false },
      notas: { columna: 'notas', conversion: 'texto', escribible: false },
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
    calculados: {
      fecha_creacion: {
        formula: 'fechaDeCreacion',
        conversion: 'fecha',
      },
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
    calculados: {
      fecha_creacion: {
        formula: 'fechaDeCreacion',
        conversion: 'fecha',
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
      imagen_url: {
        columna: 'imagen_url',
        conversion: 'texto',
        validacion: 'url_http',
        publico: true,
      },
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
      // F-107 · La ruta. Sin el día de visita, la sugerencia de pedido sólo
      // puede contestar «te queda poco», que no cambia lo que el tendero hace.
      dia_visita: { columna: 'dia_visita', conversion: 'json' },
      frecuencia: { columna: 'frecuencia', conversion: 'texto' },
      dias_credito: { columna: 'dias_credito', conversion: 'entero' },
      acepta_canje: { columna: 'acepta_canje', conversion: 'booleano' },
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
    escritura: 'lectura',
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
      rolesLectura: [...VE_COSTOS_DE_INSUMO],
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
