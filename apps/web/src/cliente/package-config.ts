// Fachada segura para el módulo heredado. El alias exacto de tsconfig hace que
// todas las pantallas consuman estos helpers sin modificar `heredado/`.
export * from '../../heredado/lib/packageConfig.js';

import {
  PACKAGE_FEATURES,
  PACKAGE_LABELS,
  PACKAGE_MODULES,
  PACKAGE_TAGLINES,
  PACKAGE_TARGET,
  ROUTE_TO_MODULE,
} from '../../heredado/lib/packageConfig.js';

type PaqueteWeb = 'esencial' | 'operativo' | 'restaurante_pro';

function paqueteSeguro(valor: unknown): PaqueteWeb {
  return valor === 'esencial' || valor === 'operativo' || valor === 'restaurante_pro'
    ? valor
    : 'esencial';
}

export function getCurrentPackage(config: { readonly paquete_modo?: unknown } | null): PaqueteWeb {
  return paqueteSeguro(config?.paquete_modo);
}

export function isPackage(
  config: { readonly paquete_modo?: unknown } | null,
  packageName: string,
): boolean {
  return getCurrentPackage(config) === packageName;
}

export function canAccessModule(moduleName: string, paqueteModo: unknown): boolean {
  return (PACKAGE_MODULES[paqueteSeguro(paqueteModo)] as readonly string[]).includes(moduleName);
}

export function getPackageLabel(paqueteModo: unknown): string {
  return PACKAGE_LABELS[paqueteSeguro(paqueteModo)];
}

export function getPackageFeatures(paqueteModo: unknown): readonly string[] {
  return PACKAGE_FEATURES[paqueteSeguro(paqueteModo)];
}

export function getPackageTagline(paqueteModo: unknown): string {
  return PACKAGE_TAGLINES[paqueteSeguro(paqueteModo)];
}

export function getPackageTarget(paqueteModo: unknown): string {
  return PACKAGE_TARGET[paqueteSeguro(paqueteModo)];
}

export function isRouteAllowed(routePath: string, paqueteModo: unknown): boolean {
  const moduleNeeded = (ROUTE_TO_MODULE as Readonly<Record<string, string>>)[routePath];
  return moduleNeeded === undefined || canAccessModule(moduleNeeded, paqueteModo);
}
