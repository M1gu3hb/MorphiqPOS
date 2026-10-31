import { esEventoDeSonido, type EventoDeSonido } from './mapa';

/**
 * QUÉ SUENA AL TOCAR (DP-11.3), sin tocar cada botón del sistema: un solo oyente en la pestaña
 * mira lo que se tocó y su cadena de padres.
 *
 * · `data-sonido="evento"` en el control o en un padre manda (`"ninguno"`: que no suene).
 * · Un interruptor (`role="switch"`) suena a encender o a apagar según cómo QUEDA.
 * · Una pestaña (`role="tab"`) o un enlace del menú (dentro de `<nav>`) es cambiar de sección.
 * · Cualquier otro botón o enlace, el toque de siempre. Deshabilitado, nada.
 */
export interface NodoTocado {
  /** En minúsculas: `button`, `a`, `div`… */
  readonly etiqueta: string;
  readonly atributo: (nombre: string) => string | null;
}

const CONTROLES = new Set(['button', 'a']);
const ROLES_DE_CONTROL = new Set([
  'button',
  'tab',
  'switch',
  'menuitem',
  'option',
  'radio',
  'checkbox',
]);

function esControl(nodo: NodoTocado): boolean {
  if (nodo.etiqueta === 'a') return nodo.atributo('href') !== null;
  if (CONTROLES.has(nodo.etiqueta)) return true;
  const rol = nodo.atributo('role');
  return rol !== null && ROLES_DE_CONTROL.has(rol);
}

function deshabilitado(nodo: NodoTocado): boolean {
  return nodo.atributo('disabled') !== null || nodo.atributo('aria-disabled') === 'true';
}

/** `cadena`: del nodo tocado hacia arriba, hasta la raíz. */
export function eventoDelClic(cadena: readonly NodoTocado[]): EventoDeSonido | null {
  const marcado = cadena.find((nodo) => nodo.atributo('data-sonido') !== null);
  const indiceDelControl = cadena.findIndex(esControl);
  const control = indiceDelControl === -1 ? undefined : cadena[indiceDelControl];
  // Sólo suena lo que se puede tocar: el hueco entre las teclas de un teclado marcado, no.
  if (control === undefined || deshabilitado(control)) return null;
  if (marcado !== undefined) {
    const valor = marcado.atributo('data-sonido') ?? '';
    return esEventoDeSonido(valor) ? valor : null;
  }
  const rol = control.atributo('role');
  if (rol === 'switch') return control.atributo('aria-checked') === 'true' ? 'apagar' : 'encender';
  if (rol === 'tab') return 'seccion';
  const dentroDeUnMenu = cadena.slice(indiceDelControl + 1).some((nodo) => nodo.etiqueta === 'nav');
  if (control.etiqueta === 'a' && dentroDeUnMenu) return 'seccion';
  return 'toque';
}

/** La cadena de un elemento del DOM, para `eventoDelClic`. */
export function cadenaDe(elemento: Element | null): NodoTocado[] {
  const cadena: NodoTocado[] = [];
  for (let nodo = elemento; nodo !== null; nodo = nodo.parentElement) {
    const actual = nodo;
    cadena.push({
      etiqueta: actual.tagName.toLowerCase(),
      atributo: (nombre) => actual.getAttribute(nombre),
    });
  }
  return cadena;
}
