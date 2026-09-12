/** Tope previo al parseo para todas las rutas JSON del backend. */
export const MAX_BYTES_CUERPO_JSON = 256 * 1024;

interface CabecerasLegibles {
  get(nombre: string): string | null;
}

/**
 * Rechaza una longitud declarada excesiva o mal formada antes de `json()`.
 * Sin longitud no se puede demostrar que el cuerpo cabe antes de parsearlo.
 * Las cuatro vías JSON fallan cerradas; los cuerpos fragmentados se rechazan.
 */
export function cuerpoDentroDelLimite(cabeceras: CabecerasLegibles): boolean {
  const declarada = cabeceras.get('content-length');
  if (declarada === null) return false;

  const normalizada = declarada.trim();
  if (!/^\d+$/.test(normalizada)) return false;

  try {
    return BigInt(normalizada) <= BigInt(MAX_BYTES_CUERPO_JSON);
  } catch {
    return false;
  }
}
