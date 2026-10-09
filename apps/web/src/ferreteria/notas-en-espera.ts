import { partidasGuardadas, type PartidaGuardada } from './nota-del-mostrador.ts';

/**
 * F9 · LA NOTA QUE ESPERA mientras se atiende a otro (C.10 de la 2.4).
 *
 * El contratista se acuerda de que le falta la lista del plomero y detrás hay tres. En la
 * tiendita esto es `venta.suspender`, del servidor; aquí la nota se arma en la pantalla
 * —con sus CAJAS, que la venta retomada del servidor no sabe devolver— y no ha tocado
 * folio, existencia ni caja. Así que espera en ESTE dispositivo (`localStorage`: sobrevive
 * a cerrar la pestaña) con un número corto que se dice en voz alta, «la 3». Retomarla la
 * devuelve tal cual, cajas incluidas.
 */

export interface NotaEnEspera {
  readonly numero: number;
  /** «el señor de la gorra»: lo que se dijo para reconocerla. */
  readonly quien: string | null;
  readonly partidas: readonly PartidaGuardada[];
  /** Desde cuándo espera, en ISO. */
  readonly desde: string;
}

/** Nunca hay veinte esperando en un mostrador: dos cifras se dicen solas. */
const MAXIMO = 99;
const CLAVE = 'morphiqpos.ferreteria.notas-en-espera';

/** Lo guardado, validado: lo que no tiene forma de nota se descarta, no revienta. */
export function notasEnEspera(texto: string | null): NotaEnEspera[] {
  if (texto === null) return [];
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((item: unknown): NotaEnEspera[] => {
    if (typeof item !== 'object' || item === null) return [];
    const n = item as Record<string, unknown>;
    const numero = n['numero'];
    const quien = n['quien'] ?? null;
    const desde = n['desde'];
    if (!Number.isSafeInteger(numero) || typeof numero !== 'number') return [];
    if (quien !== null && typeof quien !== 'string') return [];
    if (typeof desde !== 'string') return [];
    const partidas = partidasGuardadas(JSON.stringify(n['partidas'] ?? []));
    return partidas.length === 0 ? [] : [{ numero, quien, partidas, desde }];
  });
}

/** Aparta la nota con el número libre más chico. Nulo si ya hay noventa y nueve. */
export function apartarNota(
  lista: readonly NotaEnEspera[],
  partidas: readonly PartidaGuardada[],
  quien: string | null,
  ahora: Date,
): { readonly lista: NotaEnEspera[]; readonly numero: number } | null {
  if (partidas.length === 0) return null;
  const usados = new Set(lista.map((n) => n.numero));
  let numero = 1;
  while (usados.has(numero)) numero += 1;
  if (numero > MAXIMO) return null;
  const quienLimpio = quien === null || quien.trim() === '' ? null : quien.trim().slice(0, 60);
  return {
    lista: [
      ...lista,
      { numero, quien: quienLimpio, partidas: [...partidas], desde: ahora.toISOString() },
    ],
    numero,
  };
}

/** La devuelve y la quita de la espera. */
export function retomarNota(
  lista: readonly NotaEnEspera[],
  numero: number,
): { readonly lista: NotaEnEspera[]; readonly nota: NotaEnEspera | null } {
  const nota = lista.find((n) => n.numero === numero) ?? null;
  return { lista: lista.filter((n) => n.numero !== numero), nota };
}

function almacen(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function leerLasNotasEnEspera(): NotaEnEspera[] {
  try {
    return notasEnEspera(almacen()?.getItem(CLAVE) ?? null);
  } catch {
    return [];
  }
}

/** Avisa a esta pestaña que la espera cambió: `storage` sólo avisa a las OTRAS. */
const CAMBIO = 'morphiqpos:notas-en-espera';

/** `false` si no se pudo guardar: entonces la pantalla no deja apartar y lo dice. */
export function guardarLasNotasEnEspera(lista: readonly NotaEnEspera[]): boolean {
  try {
    const lugar = almacen();
    if (lugar === null) return false;
    if (lista.length === 0) lugar.removeItem(CLAVE);
    else lugar.setItem(CLAVE, JSON.stringify(lista));
    window.dispatchEvent(new Event(CAMBIO));
    return true;
  } catch {
    return false;
  }
}

/** Lo guardado, tal cual: `useSyncExternalStore` compara el texto, que es estable. */
export function textoDeLaEspera(): string | null {
  try {
    return almacen()?.getItem(CLAVE) ?? null;
  } catch {
    return null;
  }
}

/** Para `useSyncExternalStore`: esta pestaña y las otras del mismo dispositivo. */
export function suscribirseALaEspera(avisar: () => void): () => void {
  window.addEventListener('storage', avisar);
  window.addEventListener(CAMBIO, avisar);
  return () => {
    window.removeEventListener('storage', avisar);
    window.removeEventListener(CAMBIO, avisar);
  };
}
