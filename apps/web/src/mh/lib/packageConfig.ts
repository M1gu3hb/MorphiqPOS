// Helper central para el sistema de paquetes de MH Astral Systems POS.
// No oculta módulos por sí mismo: solo provee constantes y funciones puras
// que serán consumidas en fases posteriores (Sidebar, rutas, vistas internas).
//
// Portado de `historico/restaurante/src/lib/packageConfig.js`. Las tablas
// descriptivas viven en `packageCatalogo.ts` por el límite de 300 líneas.

import {
  PACKAGE_FEATURES,
  PACKAGE_LABELS,
  PACKAGE_TAGLINES,
  PACKAGE_TARGET,
} from './packageCatalogo.ts';

export const PACKAGE_KEYS = {
  ESENCIAL: 'esencial',
  OPERATIVO: 'operativo',
  RESTAURANTE_PRO: 'restaurante_pro',
} as const;

export type PaqueteMH = (typeof PACKAGE_KEYS)[keyof typeof PACKAGE_KEYS];

export function esPaqueteMH(valor: unknown): valor is PaqueteMH {
  return valor === 'esencial' || valor === 'operativo' || valor === 'restaurante_pro';
}

// Módulos esenciales (incluidos en los 3 paquetes)
const MODULOS_ESENCIAL = [
  'dashboard_basico',
  'productos_basicos',
  'categorias',
  'caja_directa',
  'ventas',
  'detalle_ventas',
  'metodos_pago',
  'tickets',
  'cortes',
  'pdf_corte',
  'registros_basicos',
  'configuracion_basica',
  'integraciones_preparadas_admin',
] as const;

// Módulos que añade Operativo (sobre Esencial)
const MODULOS_OPERATIVO_EXTRA = [
  'inventario',
  'compras',
  'gastos',
  'movimientos_inventario',
  'recetas',
  'gramajes',
  'ingredientes',
  'costos_basicos',
  'utilidad_basica',
  'margen_basico',
  'reportes_operativos',
  'exportaciones',
  'dashboard_operativo',
  // Portal QR está disponible en Operativo y Pro (NO en Esencial)
  'portal_qr',
] as const;

// Módulos que añade Restaurante Pro (sobre Operativo)
const MODULOS_PRO_EXTRA = [
  'mesas',
  'mesero',
  'cocina',
  'barra',
  'pedidos_mesa',
  'estados_mesa',
  'mapa_mesas',
  'configuracion_mesas',
  'reportes_financieros_avanzados',
  'dashboard_completo',
  'integraciones_preparadas',
  'configuracion_completa',
] as const;

export const PACKAGE_MODULES: Readonly<Record<PaqueteMH, readonly string[]>> = {
  esencial: [...MODULOS_ESENCIAL],
  operativo: [...MODULOS_ESENCIAL, ...MODULOS_OPERATIVO_EXTRA],
  restaurante_pro: [...MODULOS_ESENCIAL, ...MODULOS_OPERATIVO_EXTRA, ...MODULOS_PRO_EXTRA],
};

// ---------- Funciones helper ----------

export interface ConfigConPaquete {
  readonly paquete_modo?: string | null;
}

export function getCurrentPackage(config: ConfigConPaquete | null | undefined): PaqueteMH {
  const valor = config?.paquete_modo;
  if (esPaqueteMH(valor)) return valor;
  return 'restaurante_pro';
}

export function isPackage(
  config: ConfigConPaquete | null | undefined,
  packageName: PaqueteMH,
): boolean {
  return getCurrentPackage(config) === packageName;
}

export function canAccessModule(moduleName: string, paqueteModo: string | undefined): boolean {
  const paquete: PaqueteMH = esPaqueteMH(paqueteModo) ? paqueteModo : 'restaurante_pro';
  return PACKAGE_MODULES[paquete].includes(moduleName);
}

export function getPackageLabel(paqueteModo: string | undefined): string {
  return esPaqueteMH(paqueteModo) ? PACKAGE_LABELS[paqueteModo] : PACKAGE_LABELS.restaurante_pro;
}

export function getPackageFeatures(paqueteModo: string | undefined): readonly string[] {
  return esPaqueteMH(paqueteModo)
    ? PACKAGE_FEATURES[paqueteModo]
    : PACKAGE_FEATURES.restaurante_pro;
}

export function getPackageTagline(paqueteModo: string | undefined): string {
  return esPaqueteMH(paqueteModo)
    ? PACKAGE_TAGLINES[paqueteModo]
    : PACKAGE_TAGLINES.restaurante_pro;
}

export function getPackageTarget(paqueteModo: string | undefined): string {
  return esPaqueteMH(paqueteModo) ? PACKAGE_TARGET[paqueteModo] : PACKAGE_TARGET.restaurante_pro;
}

// ---------- Mapa de rutas -> módulo requerido ----------
// Si una ruta no está aquí, se considera siempre accesible.
export const ROUTE_TO_MODULE: Readonly<Record<string, string>> = {
  '/': 'dashboard_basico',
  '/pos': 'caja_directa',
  '/caja': 'caja_directa',
  '/ventas': 'ventas',
  '/corte-caja': 'cortes',
  '/registros': 'registros_basicos',
  '/configuracion': 'configuracion_basica',
  '/productos': 'productos_basicos',
  // Operativo+
  '/inventario': 'inventario',
  '/compras': 'compras',
  '/recetas': 'recetas',
  // Operativo + Pro (no Esencial)
  '/portal-qr': 'portal_qr',
  // Restaurante Pro
  '/mesas': 'mesas',
  '/mesero': 'mesero',
  '/cocina': 'cocina',
  '/barra': 'barra',
};

export function isRouteAllowed(routePath: string, paqueteModo: string | undefined): boolean {
  const moduleNeeded = ROUTE_TO_MODULE[routePath];
  if (moduleNeeded === undefined) return true;
  return canAccessModule(moduleNeeded, paqueteModo);
}

/**
 * El giro del negocio que guarda la base → el paquete que entiende su código.
 *
 * Son dos ejes distintos y no había forma de evitar el puente: la base guarda
 * QUÉ VENDE el negocio (`restaurante`, `cafeteria`, `tienda`, `ferreteria`,
 * `farmacia`) y su sistema guarda CUÁNTO SISTEMA contrató (`esencial`,
 * `operativo`, `restaurante_pro`). Donde se prepara comida hace falta mesero,
 * cocina y mesas; en un mostrador, no.
 *
 * Cuando el negocio pueda contratar niveles de verdad, esto se sustituye por
 * la columna que lo diga. Hasta entonces es una traducción explícita y en un
 * solo sitio, en vez de una suposición repartida por la interfaz.
 */
export function paqueteDesdeGiro(giro: string | undefined): PaqueteMH {
  if (giro === 'restaurante' || giro === 'cafeteria') return 'restaurante_pro';
  return 'operativo';
}
