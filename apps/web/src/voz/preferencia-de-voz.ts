/**
 * LA VOZ QUE ESTE DISPOSITIVO ELIGIÓ · dónde se guarda y cómo se lee sin romper nada.
 *
 * ── Por dispositivo, y a propósito ────────────────────────────────────────
 * La voz es una preferencia del TELÉFONO, la tableta o el monitor de la cocina, no del
 * negocio: cada uno tiene instaladas voces distintas, y la voz «Paulina» de un iPhone no
 * existe en el Android de la cocina. Por eso vive en `localStorage` de ese navegador y NO en
 * la configuración compartida del negocio (`configuracion.valores`). Un negocio con tres
 * dispositivos puede tener tres voces, y ninguna elección pisa a las otras.
 *
 * ── Las claves son las que ya existían ────────────────────────────────────
 * `mh_voice_manual` es la clave con que `voiceAlert.js` guardaba la voz fijada a mano
 * (`setPreferredVoice`) desde antes de que hubiera pantalla para elegirla. Se conserva: un
 * dispositivo que ya tenía una voz guardada la sigue teniendo.
 *
 * ── Nunca lanza ───────────────────────────────────────────────────────────
 * `localStorage` puede faltar o lanzar en una ventana privada, con los datos del sitio
 * bloqueados o en una vista previa. Una preferencia de voz que se pierde es un fastidio; un
 * aviso de pedido listo que no suena porque falló leerla sería un pedido que se enfría.
 */

/** La voz elegida a mano: el nombre exacto que da el sistema. Vacía: la automática. */
export const CLAVE_VOZ_ELEGIDA = 'mh_voice_manual';

/** La velocidad de la voz de este dispositivo (multiplicador de `SpeechSynthesisUtterance.rate`). */
export const CLAVE_VELOCIDAD_DE_VOZ = 'mh_voice_rate';

/** Normal. Es la velocidad que usaba el sistema antes de poder cambiarla. */
export const VELOCIDAD_POR_OMISION = 1;
export const VELOCIDAD_MINIMA = 0.7;
export const VELOCIDAD_MAXIMA = 1.3;

/** Lo mínimo que se necesita de un almacén; `Storage` lo cumple. */
export interface AlmacenDeVoz {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/** El `localStorage` del navegador, o `null` si no hay o ni siquiera se puede preguntar. */
function almacenDelNavegador(): AlmacenDeVoz | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** La voz guardada en este dispositivo; `''` si no hay o no se pudo leer. */
export function leerVozElegida(almacen: AlmacenDeVoz | null = almacenDelNavegador()): string {
  if (almacen === null) return '';
  try {
    return almacen.getItem(CLAVE_VOZ_ELEGIDA) ?? '';
  } catch {
    return '';
  }
}

/**
 * Guarda la voz de este dispositivo. `''` borra la elección y vuelve a la automática.
 * Devuelve si quedó guardada: la pantalla lo dice en vez de prometer lo que no pasó.
 */
export function guardarVozElegida(
  nombre: string,
  almacen: AlmacenDeVoz | null = almacenDelNavegador(),
): boolean {
  if (almacen === null) return false;
  try {
    if (nombre === '') almacen.removeItem(CLAVE_VOZ_ELEGIDA);
    else almacen.setItem(CLAVE_VOZ_ELEGIDA, nombre);
    return true;
  } catch {
    return false;
  }
}

/** Acota una velocidad al rango que se entiende. Lo que no es número es la normal. */
export function acotarVelocidad(valor: unknown): number {
  // `Number(null)` y `Number('')` valen 0, y 0 acotado sería «la más lenta»: no es lo que
  // quiso decir quien no puso nada.
  if (valor === null || valor === undefined || valor === '') return VELOCIDAD_POR_OMISION;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return VELOCIDAD_POR_OMISION;
  // Dos decimales: un `range` entrega 1.0500000000000003 y eso no es una preferencia.
  const redondeada = Math.round(numero * 100) / 100;
  return Math.min(VELOCIDAD_MAXIMA, Math.max(VELOCIDAD_MINIMA, redondeada));
}

/** La velocidad de este dispositivo; la normal si no hay nada guardado o está dañado. */
export function leerVelocidad(almacen: AlmacenDeVoz | null = almacenDelNavegador()): number {
  if (almacen === null) return VELOCIDAD_POR_OMISION;
  try {
    const guardada = almacen.getItem(CLAVE_VELOCIDAD_DE_VOZ);
    return guardada === null ? VELOCIDAD_POR_OMISION : acotarVelocidad(guardada);
  } catch {
    return VELOCIDAD_POR_OMISION;
  }
}

/** Guarda la velocidad ya acotada y devuelve la que quedó. */
export function guardarVelocidad(
  valor: unknown,
  almacen: AlmacenDeVoz | null = almacenDelNavegador(),
): number {
  const velocidad = acotarVelocidad(valor);
  if (almacen === null) return velocidad;
  try {
    if (velocidad === VELOCIDAD_POR_OMISION) almacen.removeItem(CLAVE_VELOCIDAD_DE_VOZ);
    else almacen.setItem(CLAVE_VELOCIDAD_DE_VOZ, String(velocidad));
  } catch {
    /* sin almacén: la velocidad vale esta sesión y ya */
  }
  return velocidad;
}
