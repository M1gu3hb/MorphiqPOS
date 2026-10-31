/**
 * EL SONIDO DE ESTE APARATO (DP-11.3): su perfil (Apagado, Suave o Normal) y su volumen. Vive en
 * el aparato, como el modo espera (DP-D39): la caja puede sonar y la tableta de la barra no.
 * «Suave» por omisión. Si el navegador niega el almacén, lo de omisión.
 */
export const CLAVE_DEL_SONIDO = 'morphiqpos.sonidos';

export const PERFILES = ['apagado', 'suave', 'normal'] as const;
export type PerfilDeSonido = (typeof PERFILES)[number];

export interface PreferenciaDeSonido {
  readonly perfil: PerfilDeSonido;
  /** De 0 a 100. */
  readonly volumen: number;
}

export const SONIDO_DE_OMISION: PreferenciaDeSonido = { perfil: 'suave', volumen: 70 };

/** «Suave» es el mismo sonido, más bajo: −9 dB, un poco más de la mitad de fuerte. */
const SUAVE_DB = -9;

interface Lector {
  getItem(clave: string): string | null;
}
interface Escritor {
  setItem(clave: string, valor: string): void;
}

function esPerfil(valor: unknown): valor is PerfilDeSonido {
  return typeof valor === 'string' && (PERFILES as readonly string[]).includes(valor);
}

function volumenValido(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100
    ? Math.round(valor)
    : null;
}

export function leerPreferenciaDeSonido(almacen: Lector | null): PreferenciaDeSonido {
  try {
    const texto = almacen?.getItem(CLAVE_DEL_SONIDO) ?? null;
    if (texto === null) return SONIDO_DE_OMISION;
    const leido: unknown = JSON.parse(texto);
    if (typeof leido !== 'object' || leido === null) return SONIDO_DE_OMISION;
    const { perfil, volumen } = leido as { perfil?: unknown; volumen?: unknown };
    return {
      perfil: esPerfil(perfil) ? perfil : SONIDO_DE_OMISION.perfil,
      volumen: volumenValido(volumen) ?? SONIDO_DE_OMISION.volumen,
    };
  } catch {
    // Ventana privada, datos bloqueados o un valor roto: lo de omisión.
    return SONIDO_DE_OMISION;
  }
}

/** Guarda la preferencia; `false` si el navegador no dejó (la pantalla lo dice). */
export function guardarPreferenciaDeSonido(
  almacen: Escritor | null,
  preferencia: PreferenciaDeSonido,
): boolean {
  if (almacen === null) return false;
  try {
    almacen.setItem(CLAVE_DEL_SONIDO, JSON.stringify(preferencia));
    return true;
  } catch {
    return false;
  }
}

/** La ganancia lineal (0 a 1) con la que suena todo en este aparato. */
export function gananciaDe(preferencia: PreferenciaDeSonido): number {
  if (preferencia.perfil === 'apagado') return 0;
  const volumen = preferencia.volumen / 100;
  return preferencia.perfil === 'suave' ? volumen * 10 ** (SUAVE_DB / 20) : volumen;
}
