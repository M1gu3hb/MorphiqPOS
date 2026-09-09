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

export interface Configuracion {
  id: Generated<string>;
  organizacion_id: string;
  valores: Generated<unknown>;
  version: Generated<number>;
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

export interface Esquema {
  almacenes: Almacenes;
  auditoria: Auditoria;
  categorias: Categorias;
  clientes: Clientes;
  comandos_ejecutados: ComandosEjecutados;
  configuracion: Configuracion;
  credenciales_pin: CredencialesPin;
  empleos: Empleos;
  existencias: Existencias;
  folios: Folios;
  identidades: Identidades;
  insumos: Insumos;
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
  producto_modificadores: ProductoModificadores;
  productos: Productos;
  recetas: Recetas;
  sesiones_caja: SesionesCaja;
  sucursales: Sucursales;
  terminales: Terminales;
}
