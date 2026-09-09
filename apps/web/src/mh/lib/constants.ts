/**
 * Portado de `historico/restaurante/src/lib/constants.js`.
 *
 * Es SU archivo. Lo único que cambia es lo que exige TypeScript: tipos en las
 * tablas y `as const` donde hacía falta para que las claves no degeneren en
 * `string`. Ni un valor, ni una etiqueta, ni un color se han tocado.
 */

export interface ConversionUnidad {
  readonly base: string;
  readonly factor: number;
}

// Unit conversion factors to base units
export const UNIT_CONVERSIONS: Readonly<Record<string, ConversionUnidad>> = {
  kg: { base: 'g', factor: 1000 },
  litro: { base: 'ml', factor: 1000 },
  g: { base: 'g', factor: 1 },
  ml: { base: 'ml', factor: 1 },
  pieza: { base: 'pieza', factor: 1 },
  paquete: { base: 'pieza', factor: 1 },
  caja: { base: 'pieza', factor: 1 },
  bolsa: { base: 'pieza', factor: 1 },
  unidad: { base: 'pieza', factor: 1 },
};

export const UNIT_LABELS: Readonly<Record<string, string>> = {
  g: 'gramos',
  ml: 'mililitros',
  pieza: 'piezas',
  kg: 'kilogramos',
  litro: 'litros',
  caja: 'cajas',
  paquete: 'paquetes',
  bolsa: 'bolsas',
  unidad: 'unidades',
};

export const STOCK_STATUS = {
  SUFFICIENT: 'suficiente',
  MEDIUM: 'medio',
  LOW: 'bajo',
  CRITICAL: 'critico',
  OUT: 'agotado',
} as const;

export type EstadoStock = (typeof STOCK_STATUS)[keyof typeof STOCK_STATUS];

export interface ConfiguracionEstadoStock {
  readonly label: string;
  readonly color: string;
  readonly dot: string;
}

export const STOCK_STATUS_CONFIG: Readonly<Record<EstadoStock, ConfiguracionEstadoStock>> = {
  suficiente: {
    label: 'Suficiente',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  medio: {
    label: 'Medio',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    dot: 'bg-yellow-500',
  },
  bajo: {
    label: 'Bajo',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  critico: {
    label: 'Crítico',
    color: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
  },
  agotado: {
    label: 'Agotado',
    color: 'bg-red-200 text-red-900 border-red-300',
    dot: 'bg-red-800',
  },
};

export interface ConfiguracionEstadoMesa {
  readonly label: string;
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

// Estados completos del flujo de mesa — colores vivos pero elegantes (skeuomorphic)
export const MESA_STATUS_CONFIG: Readonly<Record<string, ConfiguracionEstadoMesa>> = {
  libre: { label: 'Libre', fill: '#FFF8E8', stroke: '#D9C28A', text: '#5C4A1F' },
  esperando_orden: {
    label: 'Esperando orden',
    fill: '#A7E8B5',
    stroke: '#5BB573',
    text: '#1F4D2C',
  },
  pedido_enviado: { label: 'Pedido enviado', fill: '#3B82F6', stroke: '#1E5FCF', text: '#FFFFFF' },
  en_preparacion: { label: 'En preparación', fill: '#FB8C2A', stroke: '#C25E10', text: '#FFFFFF' },
  en_espera_entrega: {
    label: 'Esperando entrega',
    fill: '#16A34A',
    stroke: '#0E7A37',
    text: '#FFFFFF',
  },
  ocupada: { label: 'Ocupada', fill: '#E63946', stroke: '#A41E2A', text: '#FFFFFF' },
  cuenta_solicitada: {
    label: 'Cuenta solicitada',
    fill: '#9B5DE5',
    stroke: '#6A36B0',
    text: '#FFFFFF',
  },
  limpieza: { label: 'Limpieza', fill: '#A0744A', stroke: '#6E4C2C', text: '#FFFFFF' },
  pagada: { label: 'Pagada', fill: '#D4D4D4', stroke: '#909090', text: '#404040' },
  cancelada: { label: 'Cancelada', fill: '#7A1F28', stroke: '#4D131A', text: '#FFFFFF' },
};

export const PREP_STATUS_CONFIG: Readonly<Record<string, { label: string; color: string }>> = {
  nuevo: { label: 'Nuevo', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  en_preparacion: {
    label: 'En preparación',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  listo: { label: 'Listo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  entregado: { label: 'Entregado', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700 border-red-200' },
};

export const MARGIN_THRESHOLDS = {
  high: 60,
  medium: 40,
} as const;

export const MARGIN_CONFIG = {
  high: { label: 'Margen alto', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  medium: { label: 'Margen aceptable', color: 'text-yellow-600', bg: 'bg-yellow-50' },
  low: { label: 'Margen bajo', color: 'text-red-600', bg: 'bg-red-50' },
} as const;

export const ROLES = {
  ADMIN: 'administrador',
  CASHIER: 'caja',
  WAITER: 'mesero',
  KITCHEN: 'cocina',
} as const;

export type Rol = (typeof ROLES)[keyof typeof ROLES];

// Etiquetas completas — incluye roles legacy (`barra`) para que la UI
// de lectura siga mostrando correctamente usuarios que aún existan con
// rol legacy. NO usar para selectores de creación.
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  administrador: 'Administrador',
  caja: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
  barra: 'Barra',
};

// Etiquetas para el SELECTOR de rol al crear/editar usuarios.
// Barra deja de ser rol principal — ahora es una estación de la cocina.
// El usuario legacy con rol='barra' se sigue mostrando como "Barra" en
// listas (vía ROLE_LABELS) pero ya no es opción nueva.
export const ROLE_LABELS_SELECTABLE: Readonly<Record<Rol, string>> = {
  administrador: 'Administrador',
  caja: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
};

export const ROLE_HOME_ROUTES: Readonly<Record<string, string>> = {
  administrador: '/',
  caja: '/caja',
  mesero: '/mesero',
  cocina: '/cocina',
};

export const PAYMENT_METHODS: Readonly<Record<string, { label: string; icon: string }>> = {
  efectivo: { label: 'Efectivo', icon: 'banknote' },
  tarjeta: { label: 'Tarjeta', icon: 'credit-card' },
  transferencia: { label: 'Transferencia', icon: 'smartphone' },
  mixto: { label: 'Mixto', icon: 'layers' },
};

export const ZONAS_MESA = ['Interior', 'Exterior', 'Terraza', 'Barra', 'Otro'] as const;

export const FORMAS_MESA = [
  { value: 'redonda', label: 'Redonda' },
  { value: 'cuadrada', label: 'Cuadrada' },
  { value: 'rectangular', label: 'Rectangular' },
] as const;

export interface MedidaMesa {
  readonly w: number;
  readonly h: number;
}

export interface TamanoMesa {
  readonly label: string;
  readonly redonda: MedidaMesa;
  readonly cuadrada: MedidaMesa;
  readonly rectangular: MedidaMesa;
}

export const TAMANOS_MESA: Readonly<Record<string, TamanoMesa>> = {
  chica: {
    label: 'Chica',
    redonda: { w: 60, h: 60 },
    cuadrada: { w: 60, h: 60 },
    rectangular: { w: 90, h: 55 },
  },
  mediana: {
    label: 'Mediana',
    redonda: { w: 80, h: 80 },
    cuadrada: { w: 80, h: 80 },
    rectangular: { w: 120, h: 70 },
  },
  grande: {
    label: 'Grande',
    redonda: { w: 110, h: 110 },
    cuadrada: { w: 110, h: 110 },
    rectangular: { w: 160, h: 90 },
  },
};
