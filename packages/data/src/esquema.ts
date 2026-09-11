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
  notas: string | null;
  presets_variable: unknown;
  presets_porcion: unknown;
}

export interface Proveedores {
  id: Generated<string>;
  organizacion_id: string;
  nombre: string;
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
  movimientos_caja: MovimientosCaja;
  movimientos_stock: MovimientosStock;
  orden_linea_modificadores: OrdenLineaModificadores;
  orden_lineas: OrdenLineas;
  ordenes: Ordenes;
  organizaciones: Organizaciones;
  pagos: Pagos;
  personas: Personas;
  plantillas_compra: PlantillasCompra;
  plantillas_gasto: PlantillasGasto;
  producto_modificadores: ProductoModificadores;
  productos: Productos;
  proveedores: Proveedores;
  recetas: Recetas;
  sesiones: Sesiones;
  sesiones_caja: SesionesCaja;
  solicitudes_qr: SolicitudesQr;
  sucursales: Sucursales;
  terminales: Terminales;
  zonas: Zonas;
}
