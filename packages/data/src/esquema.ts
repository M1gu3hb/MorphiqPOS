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
  activo: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
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
  motivo: string | null;
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
  /** Con 6,000 claves, alertar de todas es una lista que nadie lee. */
  es_alta_rotacion: Generated<boolean>;
  requiere_serie: Generated<boolean>;
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
  vocabulario_negocio: VocabularioNegocio;
  zonas: Zonas;
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
