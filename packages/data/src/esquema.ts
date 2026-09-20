/**
 * Tipos del esquema de la base.
 *
 * ARCHIVO GENERADO por `pnpm db:tipos` (packages/data/bin/generar-tipos.mjs).
 * NO se edita a mano: se regenera desde la base ya migrada. Una edicion manual
 * sobrevive hasta la siguiente regeneracion y, mientras tanto, hace que el
 * compilador afirme cosas que la base no cumple.
 *
 * `Generated<T>` marca las columnas con valor por omision: opcionales al
 * insertar, siempre presentes al leer.
 */
import type { Generated } from 'kysely';

export interface Almacenes {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  nombre: string;
  principal: Generated<boolean>;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Auditoria {
  id: Generated<bigint>;
  organizacion_id: string;
  identidad_id: string | null;
  terminal_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  payload: Generated<unknown>;
  ip: string | null;
  correlation_id: string | null;
  created_at: Generated<Date>;
}

export interface BitacoraSincronizacion {
  id: Generated<string>;
  organizacion_id: string;
  tipo_registro: string;
  registro_id: string;
  destino: string;
  estado: Generated<string>;
  intentos: Generated<number>;
  ultimo_intento_en: Date | null;
  mensaje_error: string | null;
  archivo_url: string | null;
  pestana_hoja: string | null;
  payload: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Categorias {
  id: Generated<string>;
  organizacion_id: string;
  tipo: Generated<string>;
  nombre: string;
  color: string | null;
  icono: string | null;
  orden: Generated<number>;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  descripcion: string | null;
  estacion_preparacion_id: string | null;
  estacion_nombre: string | null;
  estacion_color: string | null;
}

export interface Clientes {
  id: Generated<string>;
  organizacion_id: string;
  persona_id: string | null;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
  total_visitas: Generated<number>;
  total_consumido_centavos: Generated<bigint>;
  ultima_visita: Date | null;
  saldo_pendiente_centavos: Generated<bigint>;
  limite_credito_centavos: Generated<bigint>;
  /** F-610 · `particular`, `contratista`, `plomero`, `electricista`, `empresa`. */
  tipo: Generated<string>;
  dias_plazo: Generated<number>;
  /** F-617 · El muro por mora. SIEMPRE hay llave, y es del dueño. */
  bloqueado_por_mora: Generated<boolean>;
  bloqueado_en: Date | null;
  bloqueado_por: string | null;
  /** Obligatorio cuando el muro está puesto: sin motivo no se levanta. */
  motivo_bloqueo: string | null;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;

  // ── F-040 · La ficha, que hasta la 142/162 no existía ──────────────────
  // Todas opcionales en el tipo porque sus migraciones NO están aplicadas: el
  // día que se apliquen, dejan de serlo. Declararlas obligatorias hoy haría que
  // el código las escribiera contra una tabla que no las tiene.
  /** 142 · `femenino` · `masculino` · `no_binario` · `prefiere_no_decir`. */
  genero?: string | null;
  whatsapp?: string | null;
  /** Nace en `false`: el silencio no es un sí. */
  acepta_recordatorios?: Generated<boolean>;
  /** Puede ser anterior al sistema: una clienta de ocho años no es nueva. */
  primera_visita?: string | null;
  profesional_habitual_id?: string | null;
  /** Cómo se le dice en voz alta en un salón lleno. */
  como_se_llama?: string | null;
  /** 162 · Declarados y sin usar: el CFDI está bloqueado por P-02. */
  rfc?: string | null;
  regimen_fiscal?: string | null;
  uso_cfdi?: string | null;
  codigo_postal?: string | null;
  /** Qué DÍA DEL MES paga, de 1 a 28. */
  dia_pago?: number | null;
  direccion?: string | null;
  notas_cobranza?: string | null;
  /** 094 · Qué día de la SEMANA pasa a pagar el fiado. 0 = domingo. */
  dia_pago_semana?: number | null;
  fiado_activo?: Generated<boolean>;
  fiado_desde?: string | null;
}

export interface ComandaItems {
  id: Generated<string>;
  organizacion_id: string;
  comanda_id: string;
  orden_linea_id: string | null;
  producto_id: string | null;
  producto_nombre: string;
  cantidad: string;
  notas: string | null;
  estado: Generated<string>;
  tipo_venta: string | null;
  unidad_variable: string | null;
  cantidad_variable: string | null;
  nombre_porcion: string | null;
  cantidad_porciones: string | null;
  orden_visual: Generated<number>;
  /** F-315 · El reloj de cocina. */
  iniciado_en: Date | null;
  listo_en: Date | null;
  minutos_estimados: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Comandas {
  id: Generated<string>;
  organizacion_id: string;
  orden_id: string;
  mesa_id: string | null;
  estacion_preparacion_id: string | null;
  area: string | null;
  estado: Generated<string>;
  iniciada_en: Date | null;
  lista_en: Date | null;
  entregada_en: Date | null;
  /** F-323 · Cuándo se soltó a cocina. El reloj de F-315 arranca aquí. */
  marchada_en: Date | null;
  /** F-328 · El reloj de la espera de mostrador arranca al cobrar. */
  cobrado_en: Date | null;
  llamados: Generated<number>;
  sucursal_id: string | null;
  empleado_responsable_id: string | null;
  notas: string | null;
  estacion_nombre: string | null;
  estacion_color: string | null;
  origen: Generated<string>;
  notas_alergias: string | null;
  celebracion_especial: Generated<boolean>;
  tipo_celebracion: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ComandosEjecutados {
  id: Generated<string>;
  organizacion_id: string;
  comando: string;
  idempotency_key: string;
  huella_entrada: string;
  identidad_id: string | null;
  correlation_id: string;
  respuesta: unknown;
  reintentos: Generated<number>;
  completado_en: Date | null;
  created_at: Generated<Date>;
}

export interface CompraLineas {
  id: Generated<string>;
  organizacion_id: string;
  compra_id: string;
  insumo_id: string;
  insumo_nombre: string;
  cantidad_capturada: string;
  unidad_capturada: string;
  equivalencia: Generated<string>;
  cantidad: string;
  costo_total_centavos: bigint;
  caduca_el: string | null;
  notas: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /**
   * F-631 · La clave del proveedor en SU hoja (migración 120, sin aplicar).
   *
   * Es la memoria que hace que la segunda nota del mismo proveedor se empareje
   * sola. Opcional porque la migración no está aplicada.
   */
  clave_proveedor?: string | null;
}

export interface Compras {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  proveedor_id: string | null;
  proveedor_nombre: Generated<string>;
  fecha: Generated<string>;
  total_centavos: Generated<bigint>;
  metodo_pago: string | null;
  factura_folio: string | null;
  notas: string | null;
  empleado_id: string | null;
  idempotency_key: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Configuracion {
  id: Generated<string>;
  organizacion_id: string;
  valores: Generated<unknown>;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CortesTurno {
  id: Generated<string>;
  organizacion_id: string;
  sesion_caja_id: string;
  serie: Generated<string>;
  folio: bigint;
  rango_inicio: Date;
  cortado_en: Generated<Date>;
  empleado_id: string;
  efectivo_contado_centavos: bigint;
  efectivo_retirado_centavos: Generated<bigint>;
  notas: string | null;
  idempotency_key: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CredencialesPin {
  id: Generated<string>;
  identidad_id: string;
  pin_hash: string;
  algoritmo: Generated<string>;
  intentos_fallidos: Generated<number>;
  bloqueada_hasta: Date | null;
  rotada_en: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CuotasArchivos {
  organizacion_id: string;
  bytes_usados: Generated<bigint>;
  updated_at: Generated<Date>;
}

export interface Empleos {
  id: Generated<string>;
  persona_id: string;
  organizacion_id: string;
  sucursal_id: string | null;
  rol: string;
  vigente_desde: Generated<string>;
  vigente_hasta: string | null;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  color: string | null;
  estacion_preparacion_id: string | null;
  ve_todas_las_estaciones: Generated<boolean>;
}

export interface EstacionesPreparacion {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  descripcion: string | null;
  color: Generated<string>;
  icono: string | null;
  orden: Generated<number>;
  activa: Generated<boolean>;
  es_general: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Existencias {
  organizacion_id: string;
  almacen_id: string;
  insumo_id: string;
  cantidad: Generated<string>;
  actualizado_en: Generated<Date>;
}

export interface Folios {
  organizacion_id: string;
  sucursal_id: string;
  serie: string;
  siguiente: Generated<bigint>;
}

export interface Gastos {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  sesion_caja_id: string | null;
  plantilla_gasto_id: string | null;
  fecha: Generated<string>;
  categoria: string;
  descripcion: string;
  monto_centavos: bigint;
  metodo_pago: string;
  es_recurrente: Generated<boolean>;
  empleado_id: string | null;
  notas: string | null;
  idempotency_key: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Identidades {
  id: Generated<string>;
  persona_id: string;
  auth_user_id: string | null;
  correo: string | null;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Insumos {
  id: Generated<string>;
  organizacion_id: string;
  categoria_id: string | null;
  producto_id: string | null;
  nombre: string;
  unidad_base: Generated<string>;
  costo_unitario_centavos: Generated<bigint>;
  stock_minimo: Generated<string>;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  unidad_compra_default: string | null;
  cantidad_por_compra_default: string | null;
  costo_compra_default_centavos: Generated<bigint>;
  stock_critico: Generated<string>;
  proveedor_id: string | null;
  notas: string | null;
  tipo_insumo: Generated<string>;
  capacidad_contenedor_ml: string | null;
  porciones_por_contenedor: string | null;
  ml_por_porcion: string | null;
  nombre_porcion: string | null;
  /** F-157 · A partir de aquí el grano se nota en la taza. Sólo el café lo lleva. */
  dias_frescura_optima: number | null;
  lote_abierto_id: string | null;
  unidad_captura_preferida: string | null;
  /** F-149 · En qué anaquel vive. La 091 la cuelga del insumo, no del producto. */
  zona_id: string | null;
}

export interface LimiteTasa {
  clave: string;
  ventana_en: Generated<Date>;
  intentos: Generated<number>;
}

export interface LiquidacionesPropina {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  serie: Generated<string>;
  folio: bigint;
  liquidada_en: Generated<Date>;
  rango_inicio: Date;
  rango_fin: Date;
  rango_tipo: Generated<string>;
  empleado_id: string | null;
  total_centavos: Generated<bigint>;
  empleado_liquida_id: string;
  notas: string | null;
  /** F-242 · Nulo = reparto directo al mesero, el de hoy. */
  esquema_id: string | null;
  /** F-242/F-248 · `directo` · `puntos` · `horas`. Nulo = lo histórico. */
  reparto_base: string | null;
  /** F-248 · El turno cuyo bote se repartió. Nulo en las de rango de fechas. */
  sesion_caja_id: string | null;
  /** F-242 · La fórmula usada, congelada. */
  formula_snapshot: string | null;
  idempotency_key: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MenuQrSecciones {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  orden: Generated<number>;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Mesas {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  zona_id: string | null;
  numero: number;
  nombre: string | null;
  capacidad: Generated<number>;
  forma: Generated<string>;
  tamano: Generated<string>;
  posicion_x: Generated<number>;
  posicion_y: Generated<number>;
  orden: Generated<number>;
  estado: Generated<string>;
  orden_activa_id: string | null;
  personas_actuales: Generated<number>;
  cliente_temporal: string | null;
  notas_alergias: string | null;
  celebracion_especial: Generated<boolean>;
  tipo_celebracion: string | null;
  qr_token: string | null;
  qr_activa: Generated<boolean>;
  ocupada_desde: Date | null;
  empleado_asignado_id: string | null;
  empleado_atiende_id: string | null;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ModificadorOpciones {
  id: Generated<string>;
  modificador_id: string;
  nombre: string;
  precio_extra_centavos: Generated<bigint>;
  /** F-027 · Con qué insumo sustituye a la línea de receta de su grupo. */
  insumo_sustituto_id: string | null;
  /** F-027 · Cuánto escala la receta entera. El 16 oz es 1.44. */
  factor_cantidad: Generated<string>;
  /** Firmado, al contrario que `precio_extra_centavos`: «sin crema» abarata. */
  delta_precio_centavos: Generated<bigint>;
  orden: Generated<number>;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Modificadores {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  obligatorio: Generated<boolean>;
  tipo: Generated<string>;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MovimientosCaja {
  id: Generated<string>;
  sesion_caja_id: string;
  organizacion_id: string;
  tipo: string;
  monto_centavos: bigint;
  referencia_tipo: string | null;
  referencia_id: string | null;
  empleado_id: string | null;
  motivo: string | null;
  created_at: Generated<Date>;
}

export interface MovimientosStock {
  id: Generated<string>;
  organizacion_id: string;
  almacen_id: string;
  insumo_id: string;
  tipo: string;
  cantidad: string;
  unidad: string;
  costo_unitario_centavos: Generated<bigint>;
  referencia_tipo: string | null;
  referencia_id: string | null;
  empleado_id: string | null;
  /** UNA CLAVE de `motivos_merma`, no una frase (062). Nulo si no hubo merma. */
  motivo: string | null;
  /** La explicación en palabras. La 172 se la devolvió: ver su cabecera. */
  nota?: string | null;
  idempotency_key: string | null;
  /** F-156 · El turno al que pertenece. Nulo en lo histórico. */
  sesion_caja_id: string | null;
  created_at: Generated<Date>;
}

export interface OrdenLineaModificadores {
  id: Generated<string>;
  orden_linea_id: string;
  modificador_id: string | null;
  modificador_nombre: string;
  opcion_id: string | null;
  opcion_nombre: string;
  precio_extra_centavos: Generated<bigint>;
  created_at: Generated<Date>;
}

export interface OrdenLineas {
  /** F-027 · Instantánea de las opciones elegidas. Congelada al cobrar. */
  opciones: unknown;
  /** F-030 · Qué combo agrupó esta línea. */
  combo_id: string | null;
  /** `venta` · `canje_lealtad`. El canje sale del stock y no cuenta como ticket. */
  tipo_linea: Generated<string>;
  /** F-423 · Quien lo hizo. Sin el, una cita con dos personas no se reparte. */
  profesional_id?: string | null;
  cita_servicio_id?: string | null;
  anulada_en: Date | null;
  /** F-323 · `inmediata` · `retenida` · `marchada`. */
  marcha_estado: Generated<string>;
  tiempo_servicio: number | null;
  motivo_anulacion: string | null;
  empleado_anula_id: string | null;
  id: Generated<string>;
  orden_id: string;
  organizacion_id: string;
  producto_id: string | null;
  producto_nombre: string;
  sku: string | null;
  codigo_barras: string | null;
  cantidad: string;
  unidad: Generated<string>;
  precio_unitario_centavos: bigint;
  costo_unitario_centavos: Generated<bigint>;
  descuento_centavos: Generated<bigint>;
  subtotal_centavos: bigint;
  total_centavos: bigint;
  utilidad_centavos: Generated<bigint>;
  es_mayoreo: Generated<boolean>;
  tipo_venta: Generated<string>;
  cantidad_variable: string | null;
  unidad_variable: string | null;
  nombre_porcion: string | null;
  cantidad_porciones: string | null;
  notas: string | null;
  orden_visual: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  estado_preparacion: Generated<string>;
  area_preparacion_snapshot: string | null;
  cantidad_base_consumo: string | null;
  insumo_base_id: string | null;
  insumo_base_nombre: string | null;
  precio_por_unidad_centavos: bigint | null;
  ml_por_porcion: string | null;
}

export interface Ordenes {
  /** F-331 · `aqui` · `llevar` · `plataforma` · `anticipado`. Decide el empaque. */
  canal: Generated<string>;
  /** F-328 · La etiqueta que se grita. NO es cliente_nombre. */
  nombre_pedido: string | null;
  orden_padre_id: string | null;
  division_indice: number | null;
  union_id: string | null;
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  terminal_id: string | null;
  sesion_caja_id: string | null;
  serie: Generated<string>;
  folio: bigint | null;
  estrategia_captura: Generated<string>;
  estrategia_cumplimiento: Generated<string>;
  estado: Generated<string>;
  cliente_id: string | null;
  empleado_atiende_id: string | null;
  empleado_cobra_id: string | null;
  subtotal_centavos: Generated<bigint>;
  descuento_centavos: Generated<bigint>;
  impuestos_centavos: Generated<bigint>;
  total_centavos: Generated<bigint>;
  costo_total_centavos: Generated<bigint>;
  utilidad_centavos: Generated<bigint>;
  margen_bp: Generated<number>;
  notas: string | null;
  motivo_cancelacion: string | null;
  cancelada_por: string | null;
  cancelada_en: Date | null;
  idempotency_key: string | null;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  cerrada_en: Date | null;
  mesa_id: string | null;
  personas: Generated<number>;
  cliente_nombre: string | null;
  notas_alergias: string | null;
  celebracion_especial: Generated<boolean>;
  tipo_celebracion: string | null;
  codigo_caja: string | null;
  /**
   * F-224 · El número corto de una venta apartada (migración 102, sin aplicar).
   *
   * Columna propia y no `codigo_caja`: ése ya es el código que el comensal lleva
   * a la caja desde la 045, y un mismo negocio puede tener mostrador y mesas.
   */
  codigo_espera?: string | null;
  propina_puntos_base: Generated<number>;
  propina_tipo: string | null;
  propina_origen: string | null;
  propina_liquidacion_id: string | null;
  propina_liquidada_en: Date | null;
  satisfaccion_score: number | null;
  satisfaccion_emoji: string | null;
  satisfaccion_comentario: string | null;
  satisfaccion_en: Date | null;
  /** F-639 · A qué obra del cliente se cargó. La 112 lo añade. */
  obra_id: string | null;
  autorizado_id: string | null;
  /** Quién DESPACHÓ. En una venta a crédito no hay cobro, y sin esto no queda registro. */
  mostradorista_id: string | null;
}

export interface Organizaciones {
  id: Generated<string>;
  nombre: string;
  slug: string;
  paquete: Generated<string>;
  moneda: Generated<string>;
  zona_horaria: Generated<string>;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  giro: Generated<string>;
}

export interface Pagos {
  id: Generated<string>;
  orden_id: string;
  organizacion_id: string;
  sesion_caja_id: string | null;
  metodo: string;
  monto_centavos: bigint;
  propina_centavos: Generated<bigint>;
  recibido_centavos: bigint | null;
  cambio_centavos: Generated<bigint>;
  referencia: string | null;
  estado: Generated<string>;
  idempotency_key: string | null;
  created_at: Generated<Date>;
}

export interface Personas {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PlantillasCompra {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  proveedor_nombre: string | null;
  lineas: Generated<unknown>;
  activa: Generated<boolean>;
  notas: string | null;
  ultimo_uso_en: Date | null;
  veces_usada: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PlantillasGasto {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  categoria: Generated<string>;
  monto_sugerido_centavos: Generated<bigint>;
  metodo_pago: Generated<string>;
  periodicidad: Generated<string>;
  dia_pago_sugerido: number | null;
  notas: string | null;
  activa: Generated<boolean>;
  ultimo_uso_en: Date | null;
  veces_usada: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductoModificadores {
  producto_id: string;
  modificador_id: string;
  orden: Generated<number>;
  organizacion_id: string;
}

export interface Productos {
  id: Generated<string>;
  organizacion_id: string;
  categoria_id: string | null;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  sku: string | null;
  codigo_barras: string | null;
  marca: string | null;
  precio_venta_centavos: Generated<bigint>;
  costo_unitario_centavos: Generated<bigint>;
  precio_mayoreo_centavos: bigint | null;
  /** F-930 · Cuántos sellos da UNA unidad. Cero en la bolsa de grano, a propósito. */
  sellos_otorga: Generated<number>;
  /** `bebida` · `alimento` · `grano` · `otro`. Ordena el catálogo. */
  familia: Generated<string>;
  cantidad_minima_mayoreo: string | null;
  tipo_venta: Generated<string>;
  unidad_venta: Generated<string>;
  unidad_variable: string | null;
  precio_por_unidad_variable_centavos: bigint | null;
  cantidad_minima_variable: string | null;
  cantidad_maxima_variable: string | null;
  incremento_variable: string | null;
  capacidad_contenedor_ml: string | null;
  porciones_por_contenedor: string | null;
  ml_por_porcion: string | null;
  nombre_porcion: string | null;
  precio_por_porcion_centavos: bigint | null;
  estrategia_consumo: Generated<string>;
  permite_venta_sin_stock: Generated<boolean>;
  stock_minimo: Generated<string>;
  visible_en_pos: Generated<boolean>;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  insumo_base_id: string | null;
  utilidad_unitaria_centavos: bigint | null;
  margen_bp: bigint | null;
  area_preparacion: Generated<string>;
  visible_en_menu_digital: Generated<boolean>;
  minutos_preparacion: number | null;
  /** F-323 · 1 la entrada, 2 el fuerte, 3 el postre. Nulo = va inmediato. */
  tiempo_servicio_default: number | null;
  notas: string | null;
  presets_variable: unknown;
  presets_porcion: unknown;
  /** F-156 · Gramos de grano por shot. Traduce «calibré cuatro» a inventario. */
  gramaje_shot: string | null;
  /** F-112 · Caché de la presentación con la que se vende por omisión. */
  presentacion_venta_id: string | null;
  /** F-021 · La línea de ferretería, con su esquema de atributos (110). */
  linea_id: string | null;
  // ── 092 · F-106 · La caducidad sin lote. Opcionales: migración sin aplicar.
  /** `true` sólo en lo que de verdad caduca: la lista de la mañana se lee. */
  controla_caducidad?: boolean;
  /** Con cuántos días de antelación avisar. Nulo usa el de la organización. */
  dias_alerta_caducidad?: number | null;
  // ── 098 · F-012 · El impuesto, que es de la categoría y no del producto ─
  /** En puntos base: 0, 800 (frontera) o 1600. Lista cerrada a propósito. */
  tasa_iva_bp?: number;
  /** La clave de `regimenes_ieps`. Nulo es «sin IEPS». */
  regimen_ieps?: string | null;
  /** Obligatorio en bebida saborizada: son $1.64 POR LITRO, no por pieza. */
  litros_por_unidad?: string | null;
  /** F-145 · Se vende por metro y se corta. La 111 lo enciende por clave. */
  es_continuo: Generated<boolean>;
  tipo_corte: string | null;
  /** Lo que la pantalla propone al cortar: sin valor por omisión se teclea cero. */
  merma_corte_default_base: Generated<bigint>;
  umbral_retazo_base: Generated<bigint>;
  /** F-152 · Dónde está esta pieza. Para vender, no para contar. */
  ubicacion_id: string | null;
  /** F-151 · En MILIGRAMOS, enteros. El tornillo de 5 g es 5000. */
  peso_por_pieza_mg: bigint | null;
  tolerancia_peso_pct: Generated<string>;
  peso_calibrado_en: Date | null;
  /** Quién puso la báscula: un peso mal calibrado descuadra el conteo entero. */
  peso_calibrado_por: string | null;
  /** Con 6,000 claves, alertar de todas es una lista que nadie lee. */
  es_alta_rotacion: Generated<boolean>;
  requiere_serie: Generated<boolean>;
  // ── 141 · F-155 · El doble destino: cabina y anaquel ───────────────────
  // Opcionales porque la migración no está aplicada. El día que se aplique,
  // `destino` deja de serlo y las otras dos siguen siendo nulas para lo que
  // sólo se vende.
  /** `venta` · `cabina` · `ambos`. */
  destino?: string | null;
  /** Cuántas unidades base entran a cabina al abrir UNA pieza. */
  factor_apertura?: string | null;
  unidad_cabina?: string | null;
  /**
   * F-061 · La foto que toma el mostradorista, que NO es la del catálogo.
   *
   * La del catálogo es de estudio y sirve para vender; ésta está mal iluminada
   * y sirve para encontrar la pieza en la gaveta. Mezclarlas llena el catálogo
   * de tornillos borrosos sobre un mostrador sucio.
   */
  foto_mostrador_url?: string | null;
}

export interface Proveedores {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  /** F-107 · Días de visita, 1 = lunes … 7 = domingo. Bimbo viene martes y viernes. */
  dia_visita: Generated<number[]>;
  frecuencia: Generated<string>;
  dias_credito: Generated<number>;
  acepta_canje: Generated<boolean>;
  contacto: string | null;
  telefono: string | null;
  whatsapp: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Recetas {
  id: Generated<string>;
  organizacion_id: string;
  producto_id: string;
  insumo_id: string;
  cantidad: string;
  unidad: string;
  merma_bp: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  cantidad_capturada: string | null;
  unidad_capturada: string | null;
  activa: Generated<boolean>;
  notas: string | null;
  /** F-331 · Nulo = aplica a todos los canales. Con valores, sólo a ésos. */
  aplica_canal: string[] | null;
}

export interface Sesiones {
  sid: string;
  organizacion_id: string;
  empleo_id: string;
  creada_en: Generated<Date>;
  expira_en: Date;
  revocada_en: Date | null;
}

export interface SesionesCaja {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  terminal_id: string;
  empleado_abre_id: string;
  empleado_cierra_id: string | null;
  abierta_en: Generated<Date>;
  cerrada_en: Date | null;
  estado: Generated<string>;
  fondo_inicial_centavos: Generated<bigint>;
  efectivo_contado_centavos: bigint | null;
  efectivo_retirado_centavos: bigint | null;
  notas_cierre: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  serie: Generated<string>;
  folio: bigint | null;
  fondo_esperado_centavos: Generated<bigint>;
  notas_apertura: string | null;
  /** F-984 · El fondo desglosado: «$1,500» no dice si se puede dar cambio. */
  fondo_monedas_centavos: Generated<bigint>;
  fondo_chicos_centavos: Generated<bigint>;
  fondo_grandes_centavos: Generated<bigint>;
  /** F-248 · Lo que había en el bote, contado. Nulo NO es cero. */
  bote_contado_centavos: bigint | null;
  turno: string | null;
}

export interface SolicitudesQr {
  id: Generated<string>;
  organizacion_id: string;
  mesa_id: string;
  orden_id: string | null;
  tipo: string;
  estado: Generated<string>;
  atendida_en: Date | null;
  resuelta_en: Date | null;
  empleado_atiende_id: string | null;
  empleado_destino_id: string | null;
  ruteo_modo: Generated<string>;
  origen: Generated<string>;
  token_mesa: string | null;
  notas: string | null;
  subtotal_consumo_centavos: bigint | null;
  propina_sugerida_centavos: bigint | null;
  propina_sugerida_bp: number | null;
  propina_tipo: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Sucursales {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Terminales {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  nombre: string;
  device_token_hash: string | null;
  codigo_enrolamiento_hash: string | null;
  codigo_expira_en: Date | null;
  enrolada_en: Date | null;
  ultima_actividad: Date | null;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Zonas {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  orden: Generated<number>;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Esquema {
  almacenes: Almacenes;
  auditoria: Auditoria;
  bitacora_sincronizacion: BitacoraSincronizacion;
  categorias: Categorias;
  clientes: Clientes;
  comanda_items: ComandaItems;
  comandas: Comandas;
  comandos_ejecutados: ComandosEjecutados;
  compra_lineas: CompraLineas;
  compras: Compras;
  configuracion: Configuracion;
  cortes_turno: CortesTurno;
  credenciales_pin: CredencialesPin;
  cuotas_archivos: CuotasArchivos;
  empleos: Empleos;
  estaciones_preparacion: EstacionesPreparacion;
  existencias: Existencias;
  folios: Folios;
  gastos: Gastos;
  identidades: Identidades;
  insumos: Insumos;
  limite_tasa: LimiteTasa;
  liquidaciones_propina: LiquidacionesPropina;
  menu_qr_secciones: MenuQrSecciones;
  mesas: Mesas;
  modificador_opciones: ModificadorOpciones;
  modificadores: Modificadores;
  motivos_merma: MotivosMerma;
  movimientos_caja: MovimientosCaja;
  movimientos_cuenta: MovimientosCuenta;
  eventos_mesa: EventosMesa;
  lista_espera: ListaEspera;
  llamados_pedido: LlamadosPedido;
  lotes_grano: LotesGrano;
  presencias_turno: PresenciasTurno;
  producto_presentaciones: ProductoPresentaciones;
  autorizados_cuenta: AutorizadosCuenta;
  bloqueos_agenda: BloqueosAgenda;
  cita_recursos: CitaRecursos;
  cita_servicios: CitaServicios;
  citas: Citas;
  comisiones_causadas: ComisionesCausadas;
  cortes_material: CortesMaterial;
  equivalencias: Equivalencias;
  lineas: Lineas;
  horarios_profesional: HorariosProfesional;
  liquidaciones: Liquidaciones;
  obras: Obras;
  profesionales: Profesionales;
  recursos: Recursos;
  reglas_comision: ReglasComision;
  recursos_servicio: RecursosServicio;
  servicios: Servicios;
  servicios_profesional: ServiciosProfesional;
  piezas_abiertas: PiezasAbiertas;
  remisiones: Remisiones;
  servicios_mostrador: ServiciosMostrador;
  producto_atributos: ProductoAtributos;
  redondeos: Redondeos;
  ubicaciones: Ubicaciones;
  zonas_anaquel: ZonasAnaquel;
  merma_barra_turno: MermaBarraTurno;
  fila_barra: FilaBarra;
  consumos_internos: ConsumosInternos;
  relevos_atencion: RelevosAtencion;
  esquemas_propina: EsquemasPropina;
  esquema_propina_puntos: EsquemaPropinaPuntos;
  liquidacion_propina_beneficiarios: LiquidacionPropinaBeneficiarios;
  tiempos_preparacion: TiemposPreparacion;
  ocupacion_mesas: OcupacionMesas;
  uniones_mesa: UnionesMesa;
  union_mesa_miembros: UnionMesaMiembros;
  movimientos_stock: MovimientosStock;
  orden_linea_modificadores: OrdenLineaModificadores;
  orden_lineas: OrdenLineas;
  ordenes: Ordenes;
  organizacion_modulos: OrganizacionModulos;
  organizaciones: Organizaciones;
  pagos: Pagos;
  pasivos_terceros: PasivosTerceros;
  personas: Personas;
  plantillas_compra: PlantillasCompra;
  plantillas_gasto: PlantillasGasto;
  producto_modificadores: ProductoModificadores;
  productos: Productos;
  proveedores: Proveedores;
  recetas: Recetas;
  sesiones_caja: SesionesCaja;
  sesiones: Sesiones;
  solicitudes_qr: SolicitudesQr;
  sucursales: Sucursales;
  terminales: Terminales;
  toma_conteos: TomaConteos;
  tomas_inventario: TomasInventario;
  traspaso_lineas: TraspasoLineas;
  traspasos: Traspasos;
  valuacion_lineas: ValuacionLineas;
  valuaciones_inventario: ValuacionesInventario;
  kardex: Kardex;
  saldos_pasivos: SaldosPasivos;
  documentos_credito: DocumentosCredito;
  pagos_credito: PagosCredito;
  aplicaciones_pago: AplicacionesPago;
  topes_descuento: TopesDescuento;
  autorizaciones_descuento: AutorizacionesDescuento;
  lealtad_movimientos: LealtadMovimientos;
  lealtad_saldos: LealtadSaldos;
  lealtad_pasivo: LealtadPasivo;
  pedidos_anticipados: PedidosAnticipados;
  vocabulario_negocio: VocabularioNegocio;
  zonas: Zonas;
  notas_mostrador: NotasMostrador;
  listas_trabajo: ListasTrabajo;
  lineas_lista_trabajo: LineasListaTrabajo;
  anticipos_cita: AnticiposCita;
  lista_espera_citas: ListaEsperaCitas;
  cotizaciones: Cotizaciones;
  cotizacion_lineas: CotizacionLineas;
  cotizacion_eventos: CotizacionEventos;
  movimientos_propina: MovimientosPropina;
  rentas_estacion: RentasEstacion;
  cobros_renta: CobrosRenta;
  documentos_por_pagar: DocumentosPorPagar;
  pagos_a_proveedor: PagosAProveedor;
  caducidades: Caducidades;
  garantias_proveedor: GarantiasProveedor;
  rentas_herramienta: RentasHerramienta;
  expedientes_belleza: ExpedientesBelleza;
  formulas_aplicadas: FormulasAplicadas;
  consentimientos: Consentimientos;
  fotos_expediente: FotosExpediente;
  no_shows: NoShows;
  paquetes_vendidos: PaquetesVendidos;
  sesiones_paquete: SesionesPaquete;
}

/* ── Fase 2 · tronco compartido de inventario (migraciones 058-066) ──────── */

/** F-016 · Perillas por módulo. Guarda EXCEPCIONES al preajuste, no el estado. */
export interface OrganizacionModulos {
  organizacion_id: string;
  modulo: string;
  activo: boolean;
  motivo: string | null;
  empleado_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** F-017 · Lo que un negocio cambió a mano del vocabulario de su giro. */
export interface VocabularioNegocio {
  organizacion_id: string;
  entidad: string;
  singular: string;
  plural: string;
  genero: string;
  empleado_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * F-103 · El kardex: el ledger de movimientos con su SALDO CORRIDO.
 *
 * Es una VISTA de la 060, no una tabla. La verdad sigue siendo
 * `movimientos_stock`, que es inmutable; esto es la misma verdad con una
 * función de ventana encima. Se declara aquí porque Kysely necesita su forma
 * para poder leerla con tipos, igual que cualquier tabla.
 *
 * Se lee, nunca se escribe: por eso todas sus columnas son de sólo lectura y
 * ninguna es `Generated`.
 */
export interface Kardex {
  organizacion_id: string;
  almacen_id: string;
  insumo_id: string;
  movimiento_id: string;
  created_at: Date;
  tipo: string;
  motivo: string | null;
  cantidad: string;
  unidad: string;
  costo_unitario_centavos: bigint;
  /** El costo del renglón. Firmado: una salida da importe negativo. */
  importe_centavos: bigint;
  referencia_tipo: string | null;
  referencia_id: string | null;
  empleado_id: string | null;
  /** La suma corrida por (organización, almacén, insumo). */
  saldo: string;
}

/** La vista de saldos del ledger de pasivos (063). Agregada, de sólo lectura. */
export interface SaldosPasivos {
  organizacion_id: string;
  naturaleza: string;
  titular_tipo: string;
  titular_id: string | null;
  saldo_centavos: bigint;
  movimientos: number;
  ultimo_movimiento: Date;
}

/** F-612 · Lo que un cliente debe, con su emisión y su vencimiento congelado. */
export interface DocumentosCredito {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  cliente_id: string;
  /** `venta` · `remision` · `nota_mostrador` · `ajuste`. El papel, no el hecho. */
  origen_tipo: string;
  origen_id: string | null;
  folio: string;
  emitido_en: Generated<Date>;
  /** Congelado al emitir: lo ya fiado vence cuando se dijo que vencía. */
  vence_en: Date;
  importe_centavos: bigint;
  saldo_centavos: bigint;
  empleado_id: string | null;
  created_at: Generated<Date>;
}

/** F-614 y F-615 · El pago, con lo que sobró a cuenta. */
export interface PagosCredito {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  cliente_id: string;
  monto_centavos: bigint;
  metodo: string;
  referencia: string | null;
  movimiento_caja_id: string | null;
  sesion_caja_id: string | null;
  a_cuenta_centavos: Generated<bigint>;
  empleado_id: string;
  created_at: Generated<Date>;
  // ── 115 · F-212 · La transferencia que todavía nadie vio en el banco ───
  // Opcionales porque la migración no está aplicada.
  /** `false` sólo en transferencia: hasta confirmarla no baja el saldo. */
  confirmado?: boolean;
  confirmado_en?: Date | null;
  confirmado_por?: string | null;
  /** La fecha REAL del depósito, que puede no ser la de captura. */
  recibido_en?: Date | null;
}

/** F-614 · Qué documento cubrió cada peso del pago. */
export interface AplicacionesPago {
  pago_id: string;
  documento_id: string;
  monto_centavos: bigint;
}

/** F-205 · Cuánto puede descontar cada puesto sin pedir permiso. */
export interface TopesDescuento {
  organizacion_id: string;
  rol: string;
  tope_centavos: Generated<bigint>;
  /** En puntos base. 2000 = 20 %. El segundo cerrojo, para la venta pequeña. */
  tope_bp: Generated<number>;
  actualizado_en: Generated<Date>;
  empleado_id: string | null;
}

/** F-205 · Quién autorizó saltarse su tope, sobre qué venta y por qué. */
export interface AutorizacionesDescuento {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  orden_id: string | null;
  solicita_empleo_id: string;
  autoriza_empleo_id: string;
  autoriza_rol: string;
  descuento_centavos: bigint;
  tope_centavos: bigint;
  motivo: string;
  created_at: Generated<Date>;
  // ── 115 · La llave del dueño sobre el muro de crédito (sin aplicar) ────
  /** Cuando la excepción es de CRÉDITO y no de descuento. */
  cliente_id?: string | null;
  /** Vale para esta salida y hasta esta hora: una llave sin caducidad no vuelve. */
  vence_en?: Date | null;
}

/** F-930/F-934 · Ledger INMUTABLE de sellos. La verdad; el saldo es caché. */
export interface LealtadMovimientos {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  cliente_id: string;
  tipo: string;
  /** Firmado: +1 al otorgar, −5 al canjear. El saldo es la suma. */
  sellos: number;
  orden_id: string | null;
  producto_id: string | null;
  costo_centavos: bigint | null;
  motivo: string | null;
  empleado_id: string;
  created_at: Generated<Date>;
}

export interface LealtadSaldos {
  organizacion_id: string;
  cliente_id: string;
  sellos: Generated<number>;
  canjes_totales: Generated<number>;
  actualizado_en: Generated<Date>;
}

/** F-936 · El pasivo de premios. Vista: cambia con cada venta. */
export interface LealtadPasivo {
  organizacion_id: string;
  sellos_vivos: bigint;
  clientes_con_saldo: number;
  costo_premio_centavos: bigint;
}

/** F-330 · El pedido que se cobra antes y se recoge a una hora prometida. */
export interface PedidosAnticipados {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  orden_id: string;
  nombre: string;
  telefono: string | null;
  hora_prometida: Date;
  estado: Generated<string>;
  encolado_en: Date | null;
  entregado_en: Date | null;
  empleado_id: string | null;
  created_at: Generated<Date>;
}

/** F-105 · Cabecera que amarra la salida y la entrada de un traspaso. */
export interface Traspasos {
  id: Generated<string>;
  organizacion_id: string;
  almacen_origen: string;
  almacen_destino: string;
  estado: Generated<string>;
  motivo: string | null;
  empleado_id: string | null;
  enviado_en: Date | null;
  recibido_en: Date | null;
  created_at: Generated<Date>;
}

export interface TraspasoLineas {
  id: Generated<string>;
  traspaso_id: string;
  insumo_id: string;
  cantidad: string;
  unidad: string;
  cantidad_recibida: string | null;
}

/** F-106 · Toma de inventario físico, y F-149 conteo cíclico por zona. */
export interface TomasInventario {
  id: Generated<string>;
  organizacion_id: string;
  almacen_id: string;
  estado: Generated<string>;
  /** La 091 la ascendió de texto libre a fila: un texto no lleva frecuencia. */
  zona_id: string | null;
  iniciada_en: Generated<Date>;
  cerrada_en: Date | null;
  empleado_id: string | null;
}

export interface TomaConteos {
  id: Generated<string>;
  toma_id: string;
  insumo_id: string;
  esperado: string;
  contado: string;
  unidad: string;
  /** Lo que tecleó la persona, tal cual: «nueve cajas», no «216 piezas». */
  capturas: Generated<unknown>;
  movimiento_ajuste_id: string | null;
  contado_en: Generated<Date>;
  empleado_id: string | null;
}

/** F-108 · Foto del valor del inventario en un instante. */
export interface ValuacionesInventario {
  id: Generated<string>;
  organizacion_id: string;
  almacen_id: string | null;
  metodo: string;
  tomada_en: Generated<Date>;
  valor_centavos: bigint;
  articulos: number;
  empleado_id: string | null;
}

export interface ValuacionLineas {
  valuacion_id: string;
  insumo_id: string;
  cantidad: string;
  costo_unitario_centavos: bigint;
  valor_centavos: bigint;
}

/** F-109 · Los motivos de merma. Catálogo compartido, no datos de un negocio. */
export interface MotivosMerma {
  clave: string;
  etiqueta: string;
  giro: string | null;
  imputable: Generated<boolean>;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
}

/**
 * El ledger de dinero que pasa por el cajón y NO es del negocio: F-254 fiado,
 * F-255 servicios de terceros, F-256 envases y F-260 propina por entregar.
 * INMUTABLE: una corrección es una contrapartida, nunca un `update`.
 */
export interface PasivosTerceros {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  naturaleza: string;
  titular_tipo: string;
  titular_id: string | null;
  monto_centavos: bigint;
  referencia_tipo: string | null;
  referencia_id: string | null;
  movimiento_caja_id: string | null;
  sesion_caja_id: string | null;
  motivo: string | null;
  empleado_id: string | null;
  created_at: Generated<Date>;
}

/** F-302 · Una unión de mesas, con principio y fin. */
export interface UnionesMesa {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  mesa_principal_id: string;
  orden_id: string;
  abierta_en: Generated<Date>;
  cerrada_en: Date | null;
  empleado_id: string;
  empleado_cierra_id: string | null;
}

/** F-302 · Las mesas que cuelgan de una unión. */
export interface UnionMesaMiembros {
  union_id: string;
  mesa_id: string;
  orden_absorbida_id: string | null;
  union_abierta: Generated<boolean>;
}

/** F-315 · Vista: el estimado, el real y la desviación de cada platillo. */
export interface TiemposPreparacion {
  id: string;
  organizacion_id: string;
  sucursal_id: string;
  comanda_id: string;
  estacion_preparacion_id: string | null;
  orden_linea_id: string | null;
  producto_id: string | null;
  producto_nombre: string;
  minutos_estimados: number | null;
  minutos_reales: number | null;
  desviacion_bp: number | null;
  arrancado_en: Date | null;
  listo_en: Date | null;
}

/** F-325 · Quién atendió cada cuenta y en qué tramo. */
export interface RelevosAtencion {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  orden_id: string;
  empleado_id: string;
  desde: Date;
  hasta: Date | null;
  consumo_inicio_centavos: Generated<bigint>;
  consumo_fin_centavos: bigint | null;
  empleado_releva_id: string | null;
  created_at: Generated<Date>;
}

/** F-242 · El reparto acordado por escrito, con vigencia. */
export interface EsquemasPropina {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  nombre: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  activo: Generated<boolean>;
  empleado_id: string | null;
  created_at: Generated<Date>;
}

/** F-242 · Puntos por PUESTO, no por persona. */
export interface EsquemaPropinaPuntos {
  esquema_id: string;
  puesto: string;
  puntos: string;
}

/** F-242 · El reparto real de una liquidación, congelado. */
export interface LiquidacionPropinaBeneficiarios {
  id: Generated<string>;
  liquidacion_id: string;
  empleado_id: string;
  puesto: string;
  puntos: string;
  monto_centavos: bigint;
}

/** F-261 · La comida del personal y las cortesías. Sale del stock, no de ventas. */
export interface ConsumosInternos {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  almacen_id: string;
  tipo: string;
  orden_id: string | null;
  producto_id: string | null;
  producto_nombre: string;
  cantidad: string;
  unidad: string;
  costo_centavos: bigint;
  motivo: string;
  empleado_id: string;
  created_at: Generated<Date>;
}

/** F-112 · Una forma de comprar o vender un producto. La existencia va en base. */
export interface ProductoPresentaciones {
  id: Generated<string>;
  organizacion_id: string;
  producto_id: string;
  nombre: string;
  factor: string;
  codigo_barras: string | null;
  sku: string | null;
  precio_venta_centavos: bigint | null;
  es_base: Generated<boolean>;
  es_compra_default: Generated<boolean>;
  es_venta_default: Generated<boolean>;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** F-258 · Copia de llave, entonado, corte a medida: material propio y mano de obra. */
export interface ServiciosMostrador {
  id: Generated<string>;
  organizacion_id: string;
  orden_linea_id: string;
  tipo: string;
  /** SÓLO la mano de obra. El material va por su lado, valuado por el ledger. */
  mano_obra_centavos: bigint;
  parametros: Generated<unknown>;
  /** El índice de lo consumido. La FUENTE es el ledger: si discrepan, gana él. */
  consumos: Generated<unknown>;
  empleado_id: string | null;
  created_at: Generated<Date>;
}

/** F-440 · Las cinco preguntas contestadas por escrito. Se versiona, nunca se edita. */
export interface ReglasComision {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
  version: Generated<number>;
  esquema: string;
  tasa_servicio_bp: Generated<number>;
  tasa_producto_bp: Generated<number>;
  tasa_venta_paquete_bp: Generated<number>;
  base: Generated<string>;
  sobre_iva: Generated<boolean>;
  material: Generated<string>;
  reparto: Generated<string>;
  rehacer_paga: Generated<boolean>;
  anticipo_perdido_paga: Generated<boolean>;
  escalones: unknown;
  tasa_cliente_casa_bp: number | null;
  tasa_cliente_propia_bp: number | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  created_at: Generated<Date>;
  creada_por: string | null;
}

/** F-443 · El ledger. Sin UPDATE nunca: una cancelacion escribe fila negativa. */
export interface ComisionesCausadas {
  id: Generated<string>;
  organizacion_id: string;
  orden_linea_id: string | null;
  cita_servicio_id: string | null;
  profesional_id: string;
  regla_id: string;
  /** QUE regla, en QUE version. Sin ella el historico no se explica. */
  regla_version: number;
  tipo: string;
  base_centavos: bigint;
  tasa_bp: number;
  /** Puede ser NEGATIVO: es lo que hace posible la contrapartida. */
  monto_centavos: bigint;
  material_descontado_centavos: Generated<bigint>;
  contrapartida_de_id: string | null;
  motivo: string | null;
  liquidacion_id: string | null;
  causada_en: Generated<Date>;
}

/** F-427 + F-259 · La salida mas grande del dia, con su renglon en el corte. */
export interface Liquidaciones {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  profesional_id: string;
  periodo_desde: string;
  periodo_hasta: string;
  comision_centavos: Generated<bigint>;
  /** SEPARADA de la comision, siempre. No es del salon. */
  propina_centavos: Generated<bigint>;
  material_cargado_centavos: Generated<bigint>;
  renta_centavos: Generated<bigint>;
  cobrado_por_ella_centavos: Generated<bigint>;
  anticipos_centavos: Generated<bigint>;
  total_centavos: bigint;
  movimiento_caja_id: string | null;
  pagada_en: Date | null;
  pagada_por: string | null;
  comprobante_url: string | null;
  created_at: Generated<Date>;
}

/** F-420 · Quien atiende. `empleo_id` NULL cuando renta la estacion (F-441). */
export interface Profesionales {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  empleo_id: string | null;
  nombre_completo: string;
  nombre_corto: string;
  foto_url: string | null;
  tipo_relacion: string;
  nivel: Generated<string>;
  color_agenda: string;
  regla_comision_id: string | null;
  activo: Generated<boolean>;
  orden_agenda: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** F-422 · El horario, con vigencia: la agenda de marzo se explica con marzo. */
export interface HorariosProfesional {
  id: Generated<string>;
  organizacion_id: string;
  profesional_id: string;
  /** 0 = domingo, como `extract(dow)`. */
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  created_at: Generated<Date>;
}

/** F-416 · El tiempo que NO es productivo. `profesional_id` NULL = todo el salon. */
export interface BloqueosAgenda {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  profesional_id: string | null;
  rango: string;
  motivo: string;
  nota: string | null;
  created_at: Generated<Date>;
  creado_por: string | null;
}

/** F-401 + F-415 · La duracion como secuencia: aplicacion, procesado, terminado, limpieza. */
export interface Servicios {
  producto_id: string;
  organizacion_id: string;
  duracion_activa_1_min: number;
  duracion_pasiva_min: Generated<number>;
  duracion_activa_2_min: Generated<number>;
  duracion_cierre_min: Generated<number>;
  pasivo_intercalable: Generated<boolean>;
  requiere_estacion: Generated<boolean>;
  formula_base: unknown;
  regla_comision_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** F-421 · Quien da que, a que precio y a que velocidad. */
export interface ServiciosProfesional {
  servicio_id: string;
  profesional_id: string;
  organizacion_id: string;
  precio_centavos: bigint | null;
  /** En puntos base: Karla hace el mismo tinte en 80 min y Dany en 110. */
  factor_duracion_bp: Generated<number>;
  created_at: Generated<Date>;
}

/** F-403 · La estacion, el lavabo, la secadora. */
export interface Recursos {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  nombre: string;
  tipo: string;
  capacidad: Generated<number>;
  activo: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface RecursosServicio {
  servicio_id: string;
  tipo_recurso: string;
  tramo: string;
  minutos: number | null;
}

/** F-400 · La cita. `orden_id` se llena AL COBRAR, no antes. */
export interface Citas {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  folio: string;
  cliente_id: string | null;
  origen: string;
  estado: Generated<string>;
  agendada_para: Date;
  llego_en: Date | null;
  inicio_real: Date | null;
  fin_real: Date | null;
  orden_id: string | null;
  cita_origen_id: string | null;
  es_rehacer: Generated<boolean>;
  es_cortesia: Generated<boolean>;
  motivo_cancelacion: string | null;
  no_llego_marcado_en: Date | null;
  no_llego_marcado_por: string | null;
  notas: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** La linea de la cita. `rango_activo` es multirango: el procesado lo parte. */
export interface CitaServicios {
  id: Generated<string>;
  organizacion_id: string;
  cita_id: string;
  servicio_id: string;
  profesional_id: string;
  /** Congelado al agendar: la clienta paga lo que se le dijo. */
  precio_centavos: bigint;
  rango_activo: string;
  rango_ocupacion: string;
  estado: Generated<string>;
  cerrado_en: Date | null;
  orden_linea_id: string | null;
  created_at: Generated<Date>;
}

export interface CitaRecursos {
  id: Generated<string>;
  organizacion_id: string;
  cita_servicio_id: string;
  recurso_id: string;
  rango: string;
  created_at: Generated<Date>;
}

/** F-639 · La obra se CIERRA, nunca se borra: sus remisiones se consultan años después. */
export interface Obras {
  id: Generated<string>;
  organizacion_id: string;
  cliente_id: string;
  nombre: string;
  direccion: string | null;
  estado: Generated<string>;
  limite_centavos: bigint | null;
  abierta_en: Generated<Date>;
  cerrada_en: Date | null;
}

/** F-638 · Quién puede retirar a cuenta de otro. Se da de baja, nunca se borra. */
export interface AutorizadosCuenta {
  id: Generated<string>;
  organizacion_id: string;
  cliente_id: string;
  /** Nulo = todas las obras de este cliente. */
  obra_id: string | null;
  nombre: string;
  telefono: string | null;
  identificacion: string | null;
  foto_url: string | null;
  tope_por_salida_centavos: bigint | null;
  activo: Generated<boolean>;
  dado_de_baja_en: Date | null;
  alta_por: string | null;
  created_at: Generated<Date>;
}

/** F-606 · El documento de entrega. Una orden, una remisión. */
export interface Remisiones {
  id: Generated<string>;
  organizacion_id: string;
  orden_id: string;
  folio: string;
  cliente_id: string;
  obra_id: string | null;
  autorizado_id: string | null;
  nombre_firmante: string;
  /** Se SELLA al entregar: derivarlo después mentiría al revés. */
  autorizado_estaba_en_lista: boolean;
  firma_url: string | null;
  importe_centavos: bigint;
  saldo_documento_centavos: bigint;
  entregada_en: Generated<Date>;
  entregada_por: string | null;
}

/** F-145 · El rollo abierto. NO es el inventario: dice cómo está repartido. */
export interface PiezasAbiertas {
  id: Generated<string>;
  organizacion_id: string;
  producto_id: string;
  almacen_id: string;
  /** Corto y legible: `R-114`. Se escribe en la etiqueta física. */
  folio: string;
  medida_restante_base: bigint;
  estado: Generated<string>;
  precio_remate_centavos: bigint | null;
  ubicacion_id: string | null;
  abierta_en: Generated<Date>;
  cerrada_en: Date | null;
  movimiento_cierre_id: string | null;
}

/** F-145 · El corte: lo entregado y la merma, con sus dos movimientos. */
export interface CortesMaterial {
  id: Generated<string>;
  organizacion_id: string;
  orden_linea_id: string;
  producto_id: string;
  pieza_abierta_id: string | null;
  medida_entregada_base: bigint;
  merma_base: Generated<bigint>;
  movimiento_venta_id: string;
  movimiento_merma_id: string | null;
  pieza_resultante_id: string | null;
  empleado_id: string | null;
  created_at: Generated<Date>;
}

/** F-021 · Categoría jerárquica con esquema de atributos, para ferretería. */
export interface Lineas {
  id: Generated<string>;
  organizacion_id: string;
  padre_id: string | null;
  nombre: string;
  esquema_atributos: Generated<unknown>;
  orden: Generated<number>;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** F-152 · Dónde está la pieza. Para vender, no para contar: eso es la zona. */
export interface Ubicaciones {
  id: Generated<string>;
  organizacion_id: string;
  almacen_id: string;
  codigo: string;
  descripcion: string | null;
  zona_id: string | null;
  orden_recorrido: Generated<number>;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
}

/** F-059 · Un atributo con valor. El normalizado va en MICRÓMETROS. */
export interface ProductoAtributos {
  id: Generated<string>;
  organizacion_id: string;
  producto_id: string;
  clave: string;
  valor_texto: string | null;
  valor_normalizado: bigint | null;
  /** Lo que tecleó la persona. Se conserva tal cual y nunca se deriva. */
  valor_original: string;
  created_at: Generated<Date>;
}

/** F-060 · «No tengo la de 1/2 pero la de 13 mm le sirve». */
export interface Equivalencias {
  id: Generated<string>;
  organizacion_id: string;
  producto_id: string;
  equivalente_id: string;
  tipo: string;
  nota: string | null;
  bidireccional: Generated<boolean>;
  declarado_por: string | null;
  declarado_en: Generated<Date>;
}

/** F-257 · «No tengo cambio, ¿le doy un chicle?», con renglón. */
export interface Redondeos {
  id: Generated<string>;
  organizacion_id: string;
  orden_id: string;
  tipo: string;
  /** Con signo: positivo a favor del negocio, negativo en contra. */
  importe_centavos: bigint;
  producto_especie_id: string | null;
  movimiento_stock_id: string | null;
  movimiento_caja_id: string | null;
  sesion_caja_id: string;
  empleado_id: string | null;
  created_at: Generated<Date>;
}

/** F-149 · Una zona física de la tienda. Sabe cada cuántos días toca contarla. */
export interface ZonasAnaquel {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  nombre: string;
  orden: Generated<number>;
  dias_entre_conteos: Generated<number>;
  ultimo_conteo_en: Date | null;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** F-248 · Quién estuvo en el turno y cuánto tiempo. */
export interface PresenciasTurno {
  id: Generated<string>;
  organizacion_id: string;
  sesion_caja_id: string;
  empleado_id: string;
  entro_en: Date;
  salio_en: Date | null;
  /** Columna GENERADA: nula mientras la presencia siga abierta. */
  minutos: number | null;
  origen: Generated<string>;
  ajustada_por: string | null;
  motivo_ajuste: string | null;
  created_at: Generated<Date>;
}

/** F-157 · Qué lote de grano está en la tolva y cuándo se tostó. */
export interface LotesGrano {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  insumo_id: string;
  fecha_tueste: string;
  compra_linea_id: string | null;
  abierto_en: Date | null;
  agotado_en: Date | null;
  gramos_recibidos: string;
  empleado_id: string;
  created_at: Generated<Date>;
}

/** F-156 · Vista: qué se fue en la barra este turno, por motivo e insumo. */
export interface MermaBarraTurno {
  organizacion_id: string;
  sesion_caja_id: string | null;
  motivo: string | null;
  etiqueta: string | null;
  insumo_id: string;
  insumo_nombre: string;
  unidad: string;
  cantidad: string;
  costo_centavos: bigint;
  eventos: number;
}

/** F-329 · Ledger inmutable de llamados de barra. */
export interface LlamadosPedido {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  comanda_id: string;
  medio: string;
  numero_llamado: number;
  empleado_id: string;
  ocurrido_en: Generated<Date>;
}

/** F-328 · Vista: un renglón por pedido de barra, con su espera. */
export interface FilaBarra {
  id: string;
  organizacion_id: string;
  sucursal_id: string | null;
  orden_id: string;
  nombre_pedido: string | null;
  canal: string;
  estado: string;
  estacion_preparacion_id: string | null;
  estacion_nombre: string | null;
  llamados: number;
  notas: string | null;
  notas_alergias: string | null;
  encolado_en: Date;
  lista_en: Date | null;
  entregada_en: Date | null;
  segundos_espera: number;
}

/** F-306 · La cola del viernes por la noche. */
export interface ListaEspera {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  nombre: string;
  telefono: string | null;
  personas: number;
  estado: Generated<string>;
  mesa_id: string | null;
  orden_id: string | null;
  espera_estimada_minutos: number | null;
  creada_en: Generated<Date>;
  avisada_en: Date | null;
  sentada_en: Date | null;
  notas: string | null;
  empleado_id: string | null;
}

/** F-305 · Ledger inmutable de transiciones de mesa. */
export interface EventosMesa {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  mesa_id: string;
  orden_id: string | null;
  estado_anterior: string | null;
  estado_nuevo: string;
  personas: number | null;
  empleado_id: string | null;
  ocurrido_en: Generated<Date>;
}

/** F-305 · Vista: un renglón por ciclo de ocupación. `fin` nulo es el vigente. */
export interface OcupacionMesas {
  /** `<mesa_id>:<ciclo>`. Una vista agrupada no tiene clave propia. */
  id: string;
  organizacion_id: string;
  sucursal_id: string;
  mesa_id: string;
  ciclo: number;
  orden_id: string | null;
  personas: number | null;
  inicio: Date;
  fin: Date | null;
  minutos_ocupada: number | null;
  minutos_hasta_cuenta: number | null;
}

/** F-321/F-302/F-303/F-324 · Bitácora inmutable de qué le pasó a una cuenta. */
export interface MovimientosCuenta {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string;
  tipo: string;
  orden_origen_id: string;
  orden_destino_id: string | null;
  mesa_origen_id: string | null;
  mesa_destino_id: string | null;
  lineas: string;
  motivo: string | null;
  empleado_id: string;
  created_at: Generated<Date>;
}

/**
 * F-140 · La nota de mostrador (migración 116).
 *
 * Las tres cosas que pasan en un mostrador de ferretería —se lo lleva y paga,
 * se lo lleva a crédito, o lo aparta— son la misma nota en tres estados. No
 * duplica las líneas de la orden: es su envoltorio de mostrador.
 */
export interface NotasMostrador {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  orden_id: string;
  folio: string;
  estado: Generated<string>;
  cliente_id: string | null;
  nombre_libre: string | null;
  telefono_libre: string | null;
  mostradorista_id: string | null;
  armada_en: Generated<Date>;
  /** Lo apartado CADUCA: sin esto el patio se llena de material comprometido. */
  aparta_hasta: Date | null;
  entregada_en: Date | null;
  cerrada_en: Date | null;
  nota: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** F-153 · El papel del albañil (migración 119). No es una cotización. */
export interface ListasTrabajo {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  folio: string;
  titulo: string;
  cliente_id: string | null;
  obra_id: string | null;
  nombre_libre: string | null;
  telefono_libre: string | null;
  estado: Generated<string>;
  orden_id: string | null;
  capturada_en: Generated<Date>;
  capturada_por: string | null;
  cerrada_en: Date | null;
  nota: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LineasListaTrabajo {
  id: Generated<string>;
  organizacion_id: string;
  lista_id: string;
  orden_visual: Generated<number>;
  /** Lo que dijo el albañil, tal cual. Nunca se deriva. */
  texto_pedido: string;
  producto_id: string | null;
  cantidad: string | null;
  unidad: string | null;
  surtida: Generated<string>;
  orden_linea_id: string | null;
  sin_existencia: Generated<boolean>;
  nota: string | null;
  created_at: Generated<Date>;
}

/**
 * F-414 · El anticipo de la cita (migración 138).
 *
 * Dinero AJENO hasta que el servicio ocurre. El `unique` parcial de la
 * migración impide que una cita tenga dos anticipos vivos a la vez.
 */
export interface AnticiposCita {
  id: Generated<string>;
  organizacion_id: string;
  cita_id: string;
  cliente_id: string | null;
  monto_centavos: bigint;
  metodo: string;
  estado: Generated<string>;
  movimiento_caja_id: string | null;
  sesion_caja_id: string | null;
  orden_id: string | null;
  recibido_en: Generated<Date>;
  recibido_por: string | null;
  resuelto_en: Date | null;
  motivo_resolucion: string | null;
  created_at: Generated<Date>;
}

/**
 * F-409 · A quién llamar cuando se abre un hueco (migración 140).
 *
 * Distinta de `lista_espera`, que es la del restaurante: aquélla se resuelve en
 * veinte minutos y ésta puede durar dos semanas.
 */
export interface ListaEsperaCitas {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  cliente_id: string;
  servicio_id: string | null;
  profesional_id: string | null;
  /** Una VENTANA y no una hora: nadie dice «el sábado a las 11:00». */
  ventana: string;
  flexible_de_dia: Generated<boolean>;
  prioridad: Generated<number>;
  estado: Generated<string>;
  avisada_en: Date | null;
  cita_id: string | null;
  nota: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * F-600 a F-607 · La cotización (migración 163).
 *
 * La versión es una fila NUEVA y nunca una edición: la que el cliente aprobó
 * tiene que seguir existiendo el día de la entrega, o «yo aprobé otra cosa» no
 * se puede resolver con nada.
 */
export interface Cotizaciones {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  folio: string;
  version: Generated<number>;
  version_anterior_id: string | null;
  vigente: Generated<boolean>;
  cliente_id: string | null;
  obra_id: string | null;
  nombre_libre: string | null;
  correo_libre: string | null;
  telefono_libre: string | null;
  estado: Generated<string>;
  /** Obligatoria: el acero cambia de precio cada semana. */
  vence_el: string;
  subtotal_centavos: Generated<bigint>;
  descuento_centavos: Generated<bigint>;
  impuestos_centavos: Generated<bigint>;
  total_centavos: Generated<bigint>;
  orden_id: string | null;
  motivo_cierre: string | null;
  competidor: string | null;
  creada_en: Generated<Date>;
  creada_por: string | null;
  enviada_en: Date | null;
  aprobada_en: Date | null;
  cerrada_en: Date | null;
  updated_at: Generated<Date>;
}

export interface CotizacionLineas {
  id: Generated<string>;
  organizacion_id: string;
  cotizacion_id: string;
  orden_visual: Generated<number>;
  producto_id: string | null;
  descripcion: string;
  cantidad: string;
  unidad: string;
  /** Congelado al cotizar: es lo que se honra mientras la cotización viva. */
  precio_unitario_centavos: bigint;
  total_centavos: bigint;
  surtida: Generated<string>;
  created_at: Generated<Date>;
}

export interface CotizacionEventos {
  id: Generated<string>;
  organizacion_id: string;
  cotizacion_id: string;
  tipo: string;
  medio: string | null;
  nota: string | null;
  ocurrio_en: Generated<Date>;
  empleado_id: string | null;
}

/**
 * F-243 · La propina del salón (migración 139).
 *
 * El monto va FIRMADO: lo recibido suma y lo entregado resta, sobre una sola
 * tabla. Dos tablas que se restan es cómo se le paga dos veces a alguien.
 */
export interface MovimientosPropina {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  profesional_id: string;
  orden_id: string | null;
  cita_servicio_id: string | null;
  /** `recibida` · `entregada` · `ajuste`. */
  tipo: string;
  /** Firmado. Ver el encabezado. */
  monto_centavos: bigint;
  medio: string;
  liquidacion_id: string | null;
  movimiento_caja_id: string | null;
  entregada_en: Date | null;
  entregada_por: string | null;
  nota: string | null;
  created_at: Generated<Date>;
}

/** F-441 · La renta de estación (migración 136). */
export interface RentasEstacion {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  profesional_id: string;
  recurso_id: string | null;
  monto_centavos: bigint;
  /** `semanal` · `quincenal` · `mensual`. */
  periodicidad: string;
  /** Con `semanal`, día de la semana (0 = domingo); si no, día del mes 1-28. */
  dia_de_cobro: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  activa: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CobrosRenta {
  id: Generated<string>;
  organizacion_id: string;
  renta_id: string;
  profesional_id: string;
  /** `daterange`. La exclusión GiST impide cobrar dos veces el mismo periodo. */
  periodo: string;
  monto_centavos: bigint;
  metodo: string;
  movimiento_caja_id: string | null;
  sesion_caja_id: string | null;
  cobrado_en: Generated<Date>;
  cobrado_por: string | null;
  created_at: Generated<Date>;
}

/**
 * F-635 · Lo que el negocio DEBE (migración 162).
 *
 * Es el reflejo de `documentos_credito`, con la misma forma a propósito: la
 * antigüedad se calcula igual, y dos aritméticas para el mismo concepto acaban
 * dando números distintos.
 */
export interface DocumentosPorPagar {
  id: Generated<string>;
  organizacion_id: string;
  proveedor_id: string;
  folio_proveedor: string;
  compra_id: string | null;
  emitido_en: Generated<Date>;
  vence_en: Date;
  importe_centavos: bigint;
  saldo_centavos: bigint;
  empleado_id: string | null;
  created_at: Generated<Date>;
}

export interface PagosAProveedor {
  id: Generated<string>;
  organizacion_id: string;
  proveedor_id: string;
  documento_id: string | null;
  monto_centavos: bigint;
  metodo: string;
  referencia: string | null;
  sesion_caja_id: string | null;
  empleado_id: string;
  created_at: Generated<Date>;
}

/**
 * F-153 · El expediente de belleza (migración 137).
 *
 * No es «notas del cliente»: se abre EN CADA VISITA, antes de tocar a la
 * clienta, y se llena con guantes puestos. Por eso las alergias son columna y
 * no una clave dentro de un jsonb de notas: una alergia dentro de un jsonb es
 * una alergia que nadie consulta.
 */
export interface ExpedientesBelleza {
  cliente_id: string;
  organizacion_id: string;
  /** Obligatoria aunque sea «ninguna conocida»: el hueco en blanco y el «no tiene» son cosas distintas. */
  alergias: Generated<string>;
  antecedentes: Generated<string>;
  como_llego: Generated<string>;
  que_busca: Generated<string>;
  tipo_cabello: string | null;
  porcentaje_canas: number | null;
  ultimo_alisado_en: string | null;
  /** Cada cuánto vuelve. De aquí sale «le toca volver» (F-951). */
  frecuencia_dias: number | null;
  abierto_en: Generated<Date>;
  abierto_por: string | null;
  updated_at: Generated<Date>;
}

/** F-154 · Lo que de verdad se mezcló, CONGELADO. De aquí sale el botón REPETIR. */
export interface FormulasAplicadas {
  id: Generated<string>;
  organizacion_id: string;
  cliente_id: string;
  cita_servicio_id: string | null;
  servicio_id: string | null;
  profesional_id: string | null;
  /** `{marca, tono, volumen, gramos, minutos, notas}`. No apunta al catálogo. */
  formula: unknown;
  minutos_procesado: number | null;
  resultado: string | null;
  aplicada_en: Generated<Date>;
  created_at: Generated<Date>;
}

/** El consentimiento con FECHA y ALCANCE: no es una casilla en la ficha. */
export interface Consentimientos {
  id: Generated<string>;
  organizacion_id: string;
  cliente_id: string;
  /** `expediente` · `foto_interna` · `foto_publicable` · `recordatorios`. */
  alcance: string;
  texto: string;
  otorgado_en: Generated<Date>;
  revocado_en: Date | null;
  recogido_por: string | null;
}

/** F-436 · Antes y después. Una foto por momento y por servicio, o la segunda tapa a la primera. */
export interface FotosExpediente {
  id: Generated<string>;
  organizacion_id: string;
  cliente_id: string;
  cita_servicio_id: string | null;
  /** `antes` · `despues`. */
  momento: string;
  archivo_url: string;
  consentimiento_id: string | null;
  tomada_en: Generated<Date>;
  tomada_por: string | null;
}

/**
 * F-434 · El ANTECEDENTE que `citas` no guarda (migración 140).
 *
 * De aquí cuelgan las dos únicas decisiones posibles: a quién se le pide
 * anticipo y a quién se le deja de agendar en hora pico.
 */
export interface NoShows {
  id: Generated<string>;
  organizacion_id: string;
  cliente_id: string;
  cita_id: string;
  profesional_id: string | null;
  ocurrio_en: Date;
  /** Congelado: el precio puede cambiar mañana y el hueco del martes ya se perdió a éste. */
  valor_perdido_centavos: Generated<bigint>;
  anticipo_id: string | null;
  anticipo_retenido: Generated<boolean>;
  marcado_por: string | null;
  nota: string | null;
  created_at: Generated<Date>;
}

/** F-419 · El paquete prepagado: un pasivo en la caja que hoy nadie ve. */
export interface PaquetesVendidos {
  id: Generated<string>;
  organizacion_id: string;
  cliente_id: string;
  producto_id: string;
  orden_id: string | null;
  sesiones_totales: number;
  /** Se guarda además de poder contarse: «¿cuántas le quedan?» no admite un recuento. */
  sesiones_usadas: Generated<number>;
  precio_centavos: bigint;
  vendido_en: Generated<Date>;
  vence_en: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SesionesPaquete {
  id: Generated<string>;
  organizacion_id: string;
  paquete_id: string;
  cita_servicio_id: string | null;
  numero: number;
  consumida_en: Generated<Date>;
  consumida_por: string | null;
}

/**
 * F-146 · Lo que se mandó al proveedor y no ha vuelto (migración 118).
 *
 * Un negocio mediano pierde entre $20,000 y $60,000 al año porque nadie lleva
 * esta cuenta. `orden_id` es nulo a propósito: media ferretería acepta la
 * garantía con la caja y sin ticket, y negarla por eso es perder al cliente
 * para ahorrarse una columna.
 */
export interface GarantiasProveedor {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  proveedor_id: string;
  producto_id: string;
  orden_id: string | null;
  cliente_id: string | null;
  piezas: number;
  costo_unitario_centavos: bigint;
  falla: string;
  /** `recibida` · `enviada` · `repuesta` · `rechazada` · `abonada`. */
  estado: Generated<string>;
  recibida_en: Generated<Date>;
  enviada_en: Date | null;
  folio_proveedor: string | null;
  resuelta_en: Date | null;
  resolucion: string | null;
  /** Lo que separa «se la cambié» de «se la debo», que son dos negocios. */
  repuesta_al_cliente: Generated<boolean>;
  empleado_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * F-147 · La herramienta que sale y TIENE que volver (migración 118).
 *
 * Es el envase retornable de abarrotes con otro nombre: el depósito es dinero
 * ajeno que entra y vuelve a salir, no una venta.
 */
export interface RentasHerramienta {
  id: Generated<string>;
  organizacion_id: string;
  sucursal_id: string | null;
  producto_id: string;
  cliente_id: string | null;
  nombre_libre: string | null;
  telefono_libre: string | null;
  piezas: number;
  tarifa_centavos: bigint;
  /** `hora` · `dia` · `semana`. */
  unidad_tarifa: string;
  /** NO es venta: dinero del cliente que entra y vuelve a salir. */
  deposito_centavos: Generated<bigint>;
  /** `fuera` · `devuelta` · `perdida` · `dañada`. */
  estado: Generated<string>;
  salio_en: Generated<Date>;
  compromiso_retorno: Date;
  volvio_en: Date | null;
  cobro_centavos: bigint | null;
  deposito_devuelto_centavos: bigint | null;
  danos: string | null;
  orden_id: string | null;
  empleado_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * F-106 · La caducidad SIN lote (migración 092).
 *
 * Una fecha, una cantidad y el producto. Cubre el 90 % del dolor con el 10 % de
 * la captura, y por eso se sigue capturando en la semana cuatro: el lote
 * completo es de farmacia, y pedirle a una tiendita un lote por caja de leche
 * es pedirle algo que no va a hacer.
 */
export interface Caducidades {
  id: Generated<string>;
  organizacion_id: string;
  almacen_id: string;
  producto_id: string;
  caduca_el: string;
  /** En la unidad base del producto, como todo el stock. */
  cantidad: string;
  /**
   * Lo que se ha dado de baja de ESTA fila, por venta o por merma.
   *
   * No se resta de `cantidad`: la diferencia entre las dos ES la merma que este
   * producto genera en este anaquel, y ése es el número que el negocio nunca ha
   * tenido.
   */
  consumida: Generated<string>;
  compra_id: string | null;
  registrada_en: Generated<Date>;
  registrada_por: string | null;
}
