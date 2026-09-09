import 'server-only';

import { createHmac } from 'node:crypto';

import { repoLimite } from '@morphiqpos/data';

/**
 * Límite de tasa por origen (F1.1-C-13).
 *
 * El bloqueo del PIN cuenta por credencial: frena a quien ataca UNA cuenta. No
 * frena a quien barre la plantilla probando `1234` en cada empleado, ni a quien
 * enumera códigos de enrolamiento de seis dígitos. Esto sí.
 *
 * ── De dónde sale la IP, y por qué importa ────────────────────────────────
 * Detrás de un proxy, `x-forwarded-for` es una lista y el ÚLTIMO valor es el
 * que puso el proxy de confianza; los anteriores los puede inventar el cliente.
 * Tomar el primero —que es lo que hace casi todo el mundo— deja que cualquiera
 * se ponga una IP distinta en cada intento y el límite no exista.
 *
 * En Vercel la de confianza es `x-vercel-forwarded-for`, que la plataforma
 * sobrescribe siempre. Se prefiere esa cuando está.
 */

/** Ventanas por acción. Cortas: frenan el barrido sin estorbar a nadie real. */
export const LIMITES = {
  entrar: { intentos: 20, ventanaSegundos: 300 },
  enrolar: { intentos: 10, ventanaSegundos: 600 },
} as const;

export type AccionLimitada = keyof typeof LIMITES;

export interface Permiso {
  readonly ok: boolean;
  readonly esperaSegundos: number;
}

/**
 * El origen de la petición, o `null` si no se puede determinar.
 *
 * Cuando no se sabe, NO se limita: es preferible dejar pasar en un despliegue
 * sin proxy a bloquear a todo el mundo bajo una misma clave «desconocido», que
 * convertiría el límite en la negación de servicio que evita §09.
 */
export function origenDe(cabeceras: { get(nombre: string): string | null }): string | null {
  const deVercel = cabeceras.get('x-vercel-forwarded-for');
  if (deVercel !== null && deVercel.trim() !== '') return deVercel.trim();

  const reenviada = cabeceras.get('x-forwarded-for');
  if (reenviada === null) return null;

  // El último de la lista es el que añadió el proxy más cercano al servidor.
  const partes = reenviada
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  return partes[partes.length - 1] ?? null;
}

/**
 * Cuenta el intento y dice si se permite.
 *
 * Devuelve `ok: true` cuando no hay origen determinable, y también cuando la
 * base falla: un límite de tasa que impide entrar porque su propia tabla no
 * responde deja al negocio sin cobrar por proteger un endpoint. El bloqueo por
 * credencial sigue vigente en ese caso, así que no se queda desnudo.
 */
export async function permitir(
  accion: AccionLimitada,
  cabeceras: { get(nombre: string): string | null },
  pimienta: string,
): Promise<Permiso> {
  const origen = origenDe(cabeceras);
  if (origen === null) return { ok: true, esperaSegundos: 0 };

  const { intentos: maximo, ventanaSegundos } = LIMITES[accion];
  const clave = createHmac('sha256', pimienta).update(`${accion}:${origen}`, 'utf8').digest('hex');

  try {
    const { intentos, esperaSegundos } = await repoLimite.contarIntento(clave, ventanaSegundos);
    return { ok: intentos <= maximo, esperaSegundos };
  } catch (error) {
    console.error('[limite] no se pudo contar el intento', error);
    return { ok: true, esperaSegundos: 0 };
  }
}
