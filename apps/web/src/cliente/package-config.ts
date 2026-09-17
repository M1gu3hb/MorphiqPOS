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
  isPackage as isPackageHeredado,
  normalizarPlantilla,
} from '../../heredado/lib/packageConfig.js';

/** Las tres plantillas de D-01. Son las mismas que `Plantilla` en contracts. */
export type PlantillaWeb = 'tienda' | 'cafeteria' | 'restaurante';

/** Los nombres anteriores a D-01. Siguen entrando; nunca salen. */
export type PlantillaHeredadaWeb = 'esencial' | 'operativo' | 'restaurante_pro';

/**
 * La regla de normalización vive UNA vez, en `packageConfig.js`.
 *
 * Esta fachada la tenía copiada, con su propio valor por omisión, y las dos
 * copias no decían lo mismo: el heredado caía en `restaurante_pro` y ésta en
 * `esencial`. Dos respuestas distintas a la misma pregunta según por qué puerta
 * entrara la pantalla es exactamente el defecto que se está cerrando, así que
 * aquí sólo se le pone el TIPO a lo que aquélla decide.
 */
function plantillaSegura(valor: unknown): PlantillaWeb {
  return normalizarPlantilla(valor);
}

export function getCurrentPackage(
  config: { readonly paquete_modo?: unknown } | null,
): PlantillaWeb {
  return plantillaSegura(config?.paquete_modo);
}

/**
 * Delega en el heredado en vez de comparar aquí.
 *
 * Comparar `getCurrentPackage(config) === plantillaSegura(packageName)` parece
 * lo mismo y no lo es: como lo desconocido normaliza a `tienda`, un nombre
 * inventado daría verdadero para toda tienda. El heredado filtra antes.
 */
export function isPackage(
  config: { readonly paquete_modo?: unknown } | null,
  packageName: string,
): boolean {
  return isPackageHeredado(config, packageName);
}

export function canAccessModule(moduleName: string, paqueteModo: unknown): boolean {
  return (PACKAGE_MODULES[plantillaSegura(paqueteModo)] as readonly string[]).includes(moduleName);
}

export function getPackageLabel(paqueteModo: unknown): string {
  return PACKAGE_LABELS[plantillaSegura(paqueteModo)];
}

export function getPackageFeatures(paqueteModo: unknown): readonly string[] {
  return PACKAGE_FEATURES[plantillaSegura(paqueteModo)];
}

export function getPackageTagline(paqueteModo: unknown): string {
  return PACKAGE_TAGLINES[plantillaSegura(paqueteModo)];
}

export function getPackageTarget(paqueteModo: unknown): string {
  return PACKAGE_TARGET[plantillaSegura(paqueteModo)];
}

export function isRouteAllowed(routePath: string, paqueteModo: unknown): boolean {
  const moduleNeeded = (ROUTE_TO_MODULE as Readonly<Record<string, string>>)[routePath];
  return moduleNeeded === undefined || canAccessModule(moduleNeeded, paqueteModo);
}
