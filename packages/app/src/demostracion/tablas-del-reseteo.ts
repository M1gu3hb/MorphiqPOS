/**
 * QUÉ BORRA EL RESETEO DE UNA DEMOSTRACIÓN, Y EN QUÉ ORDEN (bloque B.2 de la 2.4).
 *
 * La regla: **se borra TODA tabla del esquema salvo las de `CONSERVADAS`**, cada una con
 * su razón. Una migración que añade una tabla la añade al reseteo sin que nadie se
 * acuerde, porque el orden lo calcula `scripts/generar-limpieza-de-demo.mjs` del
 * esquema que `verify:esquema` compara con la base viva, y `pnpm verify:limpieza`
 * (y su prueba) se ponen en rojo si este archivo se desfasa.
 *
 * El orden es hijo antes que padre para toda llave foránea entre dos tablas que se
 * borran: una `restrict` nueva ya no puede abortar el reseteo entero, que es lo que pasó
 * con `remisiones → ordenes` y con `comisiones_causadas → cita_servicios`.
 *
 * Sin dependencias: lo importa el generador (un `.mjs`) y la prueba.
 */

export interface PasoDeLimpieza {
  readonly tabla: string;
  /**
   * `null`: se filtra por su propio `organizacion_id`. Si no lo tiene, se filtra por la
   * llave a un padre que sí: `delete from <tabla> where <columna> in (select <referida>
   * from <padre> where organizacion_id = …)`. `referida` es la columna del padre que la
   * llave referencia —casi siempre `id`, pero no siempre: `servicios.producto_id`—.
   */
  readonly via: {
    readonly columna: string;
    readonly padre: string;
    readonly referida: string;
  } | null;
}

/** Las tablas que el reseteo NO borra, y por qué. Todas las demás se borran. */
export const CONSERVADAS: Readonly<Record<string, string>> = {
  organizaciones:
    'Es el negocio mismo. El reseteo le devuelve su nombre y la plantilla de su giro.',
  sucursales: 'La sucursal de la demo: de ella cuelgan el equipo, las terminales y las sesiones.',
  personas:
    'El equipo. El reseteo repone el PIN de cada persona sembrada, la desbloquea y la reactiva; desactiva a quien sobre.',
  identidades: 'La identidad de cada persona del equipo, de la que cuelga su PIN.',
  credenciales_pin:
    'El PIN de cada persona. No se borra: se REPONE (PIN documentado, cero intentos, sin bloqueo).',
  empleos:
    'El puesto de cada persona. Borrarlo cerraría la sesión de quien resetea; el reseteo lo reactiva o lo desactiva.',
  terminales:
    'Se borran todas MENOS la de quien resetea, en un paso aparte y al final: su sesión vive en ella.',
  sesiones:
    'Las sesiones abiertas. Borrarlas echaría a quien acaba de pedir el reseteo a mitad de la respuesta.',
  configuracion:
    'No se borra: se REESCRIBE entera a la de una demo recién nacida (IVA, apariencia de su giro, contraseña de presentación).',
  auditoria: 'El rastro es de sólo agregar. El propio reseteo deja su renglón.',
  comandos_ejecutados:
    'El registro de idempotencia. Borrarlo dejaría que un reintento con la misma clave se ejecutara dos veces.',
  cuotas_archivos:
    'Lo que la demo ocupa en el almacén. Los archivos no se borran con la base, así que la cuota tiene que seguir contándolos.',
  limite_tasa:
    'Los contadores del límite de intentos. No se tocan desde ninguna prueba ni reseteo.',
  motivos_merma: 'Catálogo global de motivos, sin organización.',
  regimenes_ieps: 'Catálogo global del SAT, sin organización.',
  zonas:
    'La migración 045 siembra las cinco zonas de cada negocio y la sala las asegura; sin ellas las mesas no tienen dónde ir.',
  estaciones_preparacion:
    'La «Cocina general» la siembra la migración 045 y la sala asegura las demás; sin ella una comanda no tiene a dónde llegar.',
};

/**
 * Las llaves que forman un CICLO, y la columna que se pone en nulo ANTES de borrar nada
 * para romperlo. Todas admiten nulo y ninguna tiene un `check` que lo impida; la de
 * `productos.insumo_base_id` sí lo tiene, por eso el ciclo producto ↔ insumo se rompe
 * por el lado del insumo.
 *
 *   · mesas.orden_activa_id ↔ ordenes.mesa_id
 *   · ordenes.union_id ↔ uniones_mesa.orden_id
 *   · ordenes.cita_id ↔ citas.orden_id
 *   · orden_lineas.cita_servicio_id ↔ cita_servicios.orden_linea_id
 *   · insumos.producto_id ↔ productos.insumo_base_id
 *   · insumos.lote_abierto_id ↔ lotes_grano.insumo_id
 *   · productos.presentacion_venta_id ↔ producto_presentaciones.producto_id
 */
export const CICLOS: readonly { readonly tabla: string; readonly columna: string }[] = [
  { tabla: 'mesas', columna: 'orden_activa_id' },
  { tabla: 'ordenes', columna: 'union_id' },
  { tabla: 'ordenes', columna: 'cita_id' },
  { tabla: 'orden_lineas', columna: 'cita_servicio_id' },
  { tabla: 'insumos', columna: 'producto_id' },
  { tabla: 'insumos', columna: 'lote_abierto_id' },
  { tabla: 'productos', columna: 'presentacion_venta_id' },
];

// <generado por scripts/generar-limpieza-de-demo.mjs>
export const ORDEN_DE_LIMPIEZA: readonly PasoDeLimpieza[] = [
  {
    tabla: 'aplicaciones_pago',
    via: { columna: 'documento_id', padre: 'documentos_credito', referida: 'id' },
  },
  { tabla: 'autorizaciones_descuento', via: null },
  { tabla: 'bitacora_sincronizacion', via: null },
  { tabla: 'bloqueos_agenda', via: null },
  { tabla: 'caducidades', via: null },
  { tabla: 'cita_recursos', via: null },
  { tabla: 'cobros_renta', via: null },
  { tabla: 'comanda_items', via: null },
  { tabla: 'comisiones_causadas', via: null },
  { tabla: 'compra_lineas', via: null },
  { tabla: 'consumos_internos', via: null },
  { tabla: 'conteos_denominacion', via: null },
  { tabla: 'cortes_material', via: null },
  { tabla: 'cortes_turno', via: null },
  { tabla: 'cotizacion_eventos', via: null },
  { tabla: 'cotizacion_lineas', via: null },
  { tabla: 'depositos_envase', via: null },
  { tabla: 'equivalencias', via: null },
  {
    tabla: 'esquema_propina_puntos',
    via: { columna: 'esquema_id', padre: 'esquemas_propina', referida: 'id' },
  },
  { tabla: 'eventos_mesa', via: null },
  { tabla: 'existencias', via: null },
  { tabla: 'expedientes_belleza', via: null },
  { tabla: 'folios', via: null },
  { tabla: 'formulas_aplicadas', via: null },
  { tabla: 'fotos_expediente', via: null },
  { tabla: 'garantias_proveedor', via: null },
  { tabla: 'gastos', via: null },
  { tabla: 'horarios_profesional', via: null },
  { tabla: 'lealtad_movimientos', via: null },
  { tabla: 'lealtad_saldos', via: null },
  { tabla: 'lineas_lista_trabajo', via: null },
  {
    tabla: 'liquidacion_propina_beneficiarios',
    via: { columna: 'liquidacion_id', padre: 'liquidaciones_propina', referida: 'id' },
  },
  { tabla: 'lista_espera', via: null },
  { tabla: 'lista_espera_citas', via: null },
  { tabla: 'llamados_pedido', via: null },
  { tabla: 'lotes_grano', via: null },
  { tabla: 'menu_qr_secciones', via: null },
  { tabla: 'movimientos_cuenta', via: null },
  { tabla: 'movimientos_propina', via: null },
  { tabla: 'no_shows', via: null },
  { tabla: 'notas_mostrador', via: null },
  { tabla: 'operaciones_comision', via: null },
  {
    tabla: 'orden_linea_modificadores',
    via: { columna: 'orden_linea_id', padre: 'orden_lineas', referida: 'id' },
  },
  { tabla: 'organizacion_modulos', via: null },
  { tabla: 'pagos', via: null },
  { tabla: 'pagos_a_proveedor', via: null },
  { tabla: 'pasivos_terceros', via: null },
  { tabla: 'pedidos_anticipados', via: null },
  { tabla: 'plantillas_compra', via: null },
  { tabla: 'presencias_turno', via: null },
  { tabla: 'producto_atributos', via: null },
  { tabla: 'producto_modificadores', via: null },
  { tabla: 'producto_presentaciones', via: null },
  { tabla: 'recetas', via: null },
  {
    tabla: 'recursos_servicio',
    via: { columna: 'servicio_id', padre: 'servicios', referida: 'producto_id' },
  },
  { tabla: 'redondeos', via: null },
  { tabla: 'relevos_atencion', via: null },
  { tabla: 'remisiones', via: null },
  { tabla: 'rentas_herramienta', via: null },
  { tabla: 'saldos_comisionista', via: null },
  { tabla: 'servicios_mostrador', via: null },
  { tabla: 'servicios_profesional', via: null },
  { tabla: 'sesiones_paquete', via: null },
  { tabla: 'solicitudes_qr', via: null },
  { tabla: 'toma_conteos', via: { columna: 'toma_id', padre: 'tomas_inventario', referida: 'id' } },
  { tabla: 'topes_descuento', via: null },
  { tabla: 'traspaso_lineas', via: { columna: 'traspaso_id', padre: 'traspasos', referida: 'id' } },
  {
    tabla: 'union_mesa_miembros',
    via: { columna: 'union_id', padre: 'uniones_mesa', referida: 'id' },
  },
  {
    tabla: 'valuacion_lineas',
    via: { columna: 'valuacion_id', padre: 'valuaciones_inventario', referida: 'id' },
  },
  { tabla: 'vocabulario_negocio', via: null },
  { tabla: 'anticipos_cita', via: null },
  { tabla: 'cita_servicios', via: null },
  { tabla: 'comandas', via: null },
  { tabla: 'comisionistas', via: null },
  { tabla: 'consentimientos', via: null },
  { tabla: 'cotizaciones', via: null },
  { tabla: 'documentos_credito', via: null },
  { tabla: 'documentos_por_pagar', via: null },
  { tabla: 'liquidaciones', via: null },
  { tabla: 'listas_trabajo', via: null },
  {
    tabla: 'modificador_opciones',
    via: { columna: 'modificador_id', padre: 'modificadores', referida: 'id' },
  },
  { tabla: 'pagos_credito', via: null },
  { tabla: 'paquetes_vendidos', via: null },
  { tabla: 'piezas_abiertas', via: null },
  { tabla: 'plantillas_gasto', via: null },
  { tabla: 'rentas_estacion', via: null },
  { tabla: 'tomas_inventario', via: null },
  { tabla: 'traspasos', via: null },
  { tabla: 'uniones_mesa', via: null },
  { tabla: 'valuaciones_inventario', via: null },
  { tabla: 'citas', via: null },
  { tabla: 'compras', via: null },
  { tabla: 'modificadores', via: null },
  { tabla: 'movimientos_caja', via: null },
  { tabla: 'movimientos_stock', via: null },
  { tabla: 'orden_lineas', via: null },
  { tabla: 'recursos', via: null },
  { tabla: 'servicios', via: null },
  { tabla: 'ordenes', via: null },
  { tabla: 'productos', via: null },
  { tabla: 'autorizados_cuenta', via: null },
  { tabla: 'insumos', via: null },
  { tabla: 'lineas', via: null },
  { tabla: 'liquidaciones_propina', via: null },
  { tabla: 'mesas', via: null },
  { tabla: 'ubicaciones', via: null },
  { tabla: 'almacenes', via: null },
  { tabla: 'categorias', via: null },
  { tabla: 'esquemas_propina', via: null },
  { tabla: 'obras', via: null },
  { tabla: 'proveedores', via: null },
  { tabla: 'sesiones_caja', via: null },
  { tabla: 'zonas_anaquel', via: null },
  { tabla: 'clientes', via: null },
  { tabla: 'profesionales', via: null },
  { tabla: 'reglas_comision', via: null },
];
// </generado>
