import { MINUTOS_MAXIMOS } from './reglas';

/**
 * EL MODO ESPERA DE ESTE APARATO (DP-11.2): encendido o apagado y sus minutos (o los de cada
 * pantalla). Vive en el aparato, como la vista «Solicitudes» (DP-D24): una tableta se queda como
 * caja o como cocina sin rol ni PIN nuevos. Si el navegador niega el almacén, lo de omisión.
 */
export const CLAVE_DE_LA_ESPERA = 'morphiqpos.modo-espera';

export interface PreferenciaDeEspera {
  readonly activa: boolean;
  /** `null`: los de cada pantalla (3 en Caja y Tablero, 2 en Cocina). */
  readonly minutos: number | null;
}

export const ESPERA_DE_OMISION: PreferenciaDeEspera = { activa: true, minutos: null };

interface Lector {
  getItem(clave: string): string | null;
}
interface Escritor {
  setItem(clave: string, valor: string): void;
}

function minutosValidos(valor: unknown): number | null {
  return typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= 1 &&
    valor <= MINUTOS_MAXIMOS
    ? valor
    : null;
}

export function leerPreferenciaDeEspera(almacen: Lector | null): PreferenciaDeEspera {
  try {
    const texto = almacen?.getItem(CLAVE_DE_LA_ESPERA) ?? null;
    if (texto === null) return ESPERA_DE_OMISION;
    const leido: unknown = JSON.parse(texto);
    if (typeof leido !== 'object' || leido === null) return ESPERA_DE_OMISION;
    const { activa, minutos } = leido as { activa?: unknown; minutos?: unknown };
    if (typeof activa !== 'boolean') return ESPERA_DE_OMISION;
    return { activa, minutos: minutosValidos(minutos) };
  } catch {
    // Ventana privada, datos bloqueados o un valor roto: lo de omisión, sin tumbar la pantalla.
    return ESPERA_DE_OMISION;
  }
}

/** Guarda la preferencia; `false` si el navegador no dejó (la pantalla lo dice). */
export function guardarPreferenciaDeEspera(
  almacen: Escritor | null,
  preferencia: PreferenciaDeEspera,
): boolean {
  if (almacen === null) return false;
  try {
    almacen.setItem(CLAVE_DE_LA_ESPERA, JSON.stringify(preferencia));
    return true;
  } catch {
    return false;
  }
}
