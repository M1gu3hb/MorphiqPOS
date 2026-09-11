/** Tope previo al parseo para todas las rutas JSON del backend. */
export const MAX_BYTES_CUERPO_JSON = 256 * 1024;

interface CabecerasLegibles {
  get(nombre: string): string | null;
}

/**
 * Rechaza una longitud declarada excesiva o mal formada antes de `json()`.
 * La ausencia se admite porque algunos runtimes entregan cuerpos fragmentados.
 */
export function cuerpoDentroDelLimite(cabeceras: CabecerasLegibles): boolean {
  const declarada = cabeceras.get('content-length');
  if (declarada === null) return true;

  const normalizada = declarada.trim();
  if (!/^\d+$/.test(normalizada)) return false;

  try {
    return BigInt(normalizada) <= BigInt(MAX_BYTES_CUERPO_JSON);
  } catch {
    return false;
  }
}
