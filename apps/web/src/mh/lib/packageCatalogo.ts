/**
 * Portado de `historico/restaurante/src/lib/packageConfig.js` — las tablas
 * DESCRIPTIVAS de sus tres paquetes.
 *
 * Se separaron de los helpers sólo por el límite de 300 líneas por archivo.
 * Juntos son su `packageConfig.js`: ni una etiqueta, ni un texto, ni una fila
 * de la comparativa han cambiado.
 */

import type { PaqueteMH } from './packageConfig.ts';

export const PACKAGE_LABELS: Readonly<Record<PaqueteMH, string>> = {
  esencial: 'Esencial',
  operativo: 'Operativo',
  restaurante_pro: 'Restaurante Pro',
};

export const PACKAGE_TAGLINES: Readonly<Record<PaqueteMH, string>> = {
  esencial: 'POS básico para vender, cobrar e imprimir ticket.',
  operativo: 'POS con inventario, compras, gastos y costos básicos.',
  restaurante_pro: 'Sistema completo para restaurantes con mesas, mesero y cocina.',
};

export const PACKAGE_TARGET: Readonly<Record<PaqueteMH, string>> = {
  esencial: 'Negocios pequeños, mostradores y puestos rápidos.',
  operativo: 'Negocios que controlan inventario, compras y gastos.',
  restaurante_pro: 'Restaurantes, cafeterías, fondas y bares con operación completa.',
};

export interface FlujoPaquete {
  readonly titulo: string;
  readonly descripcion: string;
  readonly pasos: readonly string[];
}

// Flujo operativo real de cada paquete (para Modo Presentación)
export const PACKAGE_FLOW: Readonly<Record<PaqueteMH, FlujoPaquete>> = {
  esencial: {
    titulo: 'Caja directa / Punto de venta de mostrador',
    descripcion:
      'No usa Mesero digital, Cocina digital ni Mesas. El negocio puede tomar pedidos en papel/libreta y capturarlos en Caja al cobrar.',
    pasos: ['Nueva venta', 'Seleccionar productos', 'Cobrar', 'Imprimir ticket', 'Corte de caja'],
  },
  operativo: {
    titulo: 'Caja directa con control operativo completo',
    descripcion:
      'No usa Mesero digital, Cocina digital ni Mesas. Puede trabajar con pedidos físicos en papel/libreta. Suma inventario, compras, gastos, recetas, gramajes, costos y utilidad básica.',
    pasos: ['Nueva venta', 'Productos', 'Cobro', 'Ticket', 'Corte', 'Control operativo'],
  },
  restaurante_pro: {
    titulo: 'Sistema completo digital para restaurante',
    descripcion:
      'Flujo completo con Mesero, Mesas, Cocina y Caja. Operación digital interna de extremo a extremo.',
    pasos: ['Mesero toma pedido', 'Cocina prepara', 'Caja cobra', 'Corte', 'Reportes'],
  },
};

// Resumen de funciones por paquete (para tabla comparativa en UI)
export const PACKAGE_FEATURES: Readonly<Record<PaqueteMH, readonly string[]>> = {
  esencial: [
    'Dashboard básico',
    'Productos y categorías',
    'Punto de venta / Caja directa',
    'Tickets y cortes de caja',
    'PDF de corte',
    'Registros básicos',
    'Configuración del negocio',
  ],
  operativo: [
    'Todo lo de Esencial',
    'Inventario y movimientos',
    'Compras y gastos',
    'Recetas y gramajes',
    'Costos, utilidad y margen básicos',
    'Reportes operativos y exportaciones',
  ],
  restaurante_pro: [
    'Todo lo de Operativo',
    'Mesas, mesero y cocina',
    'Pedidos por mesa y estados',
    'Mapa avanzado de mesas',
    'Reportes financieros avanzados',
    'Integraciones Google Sheets/Drive preparadas',
  ],
};

export interface Addon {
  readonly key: string;
  readonly nombre: string;
}

// Add-ons que se cotizan aparte (no son paquetes)
export const ADDONS: readonly Addon[] = [
  { key: 'ia_analisis', nombre: 'IA para análisis y reportes' },
  { key: 'pagina_web', nombre: 'Página web del negocio' },
  { key: 'menu_digital', nombre: 'Menú digital público' },
  { key: 'google_real', nombre: 'Google Sheets/Drive conectado' },
  { key: 'app_escritorio', nombre: 'App de escritorio' },
  { key: 'impresoras', nombre: 'Impresoras térmicas / impresión' },
  { key: 'capacitacion', nombre: 'Capacitación' },
  { key: 'carga_masiva', nombre: 'Carga masiva de productos' },
  { key: 'visual_premium', nombre: 'Personalización visual premium' },
  { key: 'multi_sucursal', nombre: 'Multi-sucursal' },
  { key: 'modo_offline', nombre: 'Modo offline / local' },
  { key: 'soporte_prioritario', nombre: 'Soporte prioritario' },
  { key: 'reportes_ejecutivos', nombre: 'Reportes mensuales ejecutivos' },
];

/** `true` = incluido, `false` = no incluido, `'addon'` = sólo como add-on. */
export type ValorComparativa = boolean | string;

export interface FilaComparativa {
  readonly funcion: string;
  readonly esencial: ValorComparativa;
  readonly operativo: ValorComparativa;
  readonly restaurante_pro: ValorComparativa;
}

// Comparador detallado fila por fila (para UI tipo tabla)
export const PACKAGE_COMPARISON: readonly FilaComparativa[] = [
  { funcion: 'Dashboard', esencial: 'Básico', operativo: 'Operativo', restaurante_pro: 'Completo' },
  { funcion: 'Productos y categorías', esencial: true, operativo: true, restaurante_pro: true },
  { funcion: 'Caja / Punto de venta', esencial: true, operativo: true, restaurante_pro: true },
  { funcion: 'Tickets', esencial: true, operativo: true, restaurante_pro: true },
  { funcion: 'Corte de caja y PDF', esencial: true, operativo: true, restaurante_pro: true },
  {
    funcion: 'Registros',
    esencial: 'Básicos',
    operativo: 'Operativos',
    restaurante_pro: 'Completos',
  },
  { funcion: 'Inventario', esencial: false, operativo: true, restaurante_pro: true },
  { funcion: 'Compras', esencial: false, operativo: true, restaurante_pro: true },
  { funcion: 'Gastos', esencial: false, operativo: true, restaurante_pro: true },
  { funcion: 'Recetas / gramajes', esencial: false, operativo: true, restaurante_pro: true },
  {
    funcion: 'Costos / utilidad / margen',
    esencial: false,
    operativo: 'Básico',
    restaurante_pro: 'Avanzado',
  },
  { funcion: 'Mesas', esencial: false, operativo: false, restaurante_pro: true },
  { funcion: 'Mesero', esencial: false, operativo: false, restaurante_pro: true },
  { funcion: 'Cocina / Barra', esencial: false, operativo: false, restaurante_pro: true },
  {
    funcion: 'Reportes financieros avanzados',
    esencial: false,
    operativo: false,
    restaurante_pro: true,
  },
  {
    funcion: 'Integraciones preparadas',
    esencial: 'Admin',
    operativo: true,
    restaurante_pro: true,
  },
  { funcion: 'IA para análisis', esencial: 'addon', operativo: 'addon', restaurante_pro: 'addon' },
];
