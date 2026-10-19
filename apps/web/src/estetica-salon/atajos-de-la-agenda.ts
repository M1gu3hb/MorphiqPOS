/**
 * LOS ATAJOS DE LA AGENDA EN LA PC (§4.3.1; C.10 de la 2.4): ← → día anterior y siguiente,
 * H hoy, N nueva cita, W walk-in, / buscar clienta, ESC cerrar el cajón.
 *
 * Dentro de un campo no se roba ninguna tecla —la «n» es de quien escribe un nombre—, y con
 * Ctrl, Alt o Cmd tampoco: esas combinaciones son del navegador.
 */

export type AccionDeLaAgenda =
  'anterior' | 'siguiente' | 'hoy' | 'nueva' | 'walk_in' | 'buscar' | 'cerrar';

const POR_TECLA: Readonly<Record<string, AccionDeLaAgenda>> = {
  ArrowLeft: 'anterior',
  ArrowRight: 'siguiente',
  h: 'hoy',
  H: 'hoy',
  n: 'nueva',
  N: 'nueva',
  w: 'walk_in',
  W: 'walk_in',
  '/': 'buscar',
  Escape: 'cerrar',
};

export interface TeclaDeLaAgenda {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly target: EventTarget | null;
}

/**
 * ¿El foco está en un campo? Por su FORMA (etiqueta y edición) y no con `instanceof
 * HTMLElement`: así se prueba sin navegador, y un elemento de otro documento —un iframe—
 * también cuenta.
 */
function enUnCampo(objetivo: EventTarget | null): boolean {
  if (objetivo === null || !('tagName' in objetivo)) return false;
  const { tagName, isContentEditable } = objetivo as {
    readonly tagName?: unknown;
    readonly isContentEditable?: unknown;
  };
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    isContentEditable === true
  );
}

/** La acción de esa tecla en la agenda, o nula si la tecla es de otro. */
export function accionDeTeclaEnLaAgenda(evento: TeclaDeLaAgenda): AccionDeLaAgenda | null {
  if (evento.ctrlKey || evento.altKey || evento.metaKey) return null;
  const accion = Object.hasOwn(POR_TECLA, evento.key) ? POR_TECLA[evento.key] : undefined;
  if (accion === undefined) return null;
  // ESC cierra aunque el foco esté en un campo del cajón; las demás no se roban.
  if (accion !== 'cerrar' && enUnCampo(evento.target)) return null;
  return accion;
}
