import type { EventoDeSonido } from './mapa';

/**
 * LO QUE APARECE Y DESAPARECE (DP-11.3): un diálogo o cajón que se abre o se cierra y los avisos
 * de error o de advertencia suenan sin tocar los cientos de lugares que los abren. Se mira el
 * DOM: los diálogos de Radix llevan `role="dialog"` y los avisos de Sonner `data-sonner-toast` con
 * su `data-type`. La capa del modo espera es un diálogo, pero suena aparte (anochecer, amanecer).
 */
export interface NodoVisto {
  /** El `data-type` de cada aviso de Sonner que es él o lleva dentro. */
  readonly avisos: readonly (string | null)[];
  /** ¿Él o algo dentro es un diálogo que cuenta? */
  readonly contieneDialogo: boolean;
}

const SELECTOR_DE_DIALOGO = '[role="dialog"]:not([data-modo-espera]), [role="alertdialog"]';

export function eventoAlAparecer(nodo: NodoVisto): EventoDeSonido | null {
  if (nodo.avisos.length > 0) {
    if (nodo.avisos.includes('error')) return 'error';
    if (nodo.avisos.some((tipo) => tipo === 'warning' || tipo === 'info')) return 'aviso';
    return null;
  }
  return nodo.contieneDialogo ? 'abrir' : null;
}

export function eventoAlDesaparecer(nodo: NodoVisto): EventoDeSonido | null {
  return nodo.contieneDialogo ? 'cerrar' : null;
}

const SELECTOR_DE_AVISO = '[data-sonner-toast]';

/**
 * El primer aviso no llega solo: Sonner pinta su lista (`<ol data-sonner-toaster>`) cuando hay
 * algo que enseñar, y la lista nueva ya trae el aviso dentro. Por eso se mira adentro también.
 */
function visto(elemento: Element): NodoVisto {
  const avisos = [
    ...(elemento.matches(SELECTOR_DE_AVISO) ? [elemento] : []),
    ...elemento.querySelectorAll(SELECTOR_DE_AVISO),
  ];
  return {
    avisos: avisos.map((aviso) => aviso.getAttribute('data-type')),
    contieneDialogo:
      elemento.matches(SELECTOR_DE_DIALOGO) || elemento.querySelector(SELECTOR_DE_DIALOGO) !== null,
  };
}

/** Escucha la raíz y llama a `sonar` con cada aparición o desaparición que suena. */
export function observarLoQueAparece(
  raiz: Element,
  sonar: (evento: EventoDeSonido) => void,
): () => void {
  const observador = new MutationObserver((cambios) => {
    for (const cambio of cambios) {
      for (const nodo of cambio.addedNodes) {
        if (!(nodo instanceof Element)) continue;
        const evento = eventoAlAparecer(visto(nodo));
        if (evento !== null) sonar(evento);
      }
      for (const nodo of cambio.removedNodes) {
        if (!(nodo instanceof Element)) continue;
        const evento = eventoAlDesaparecer(visto(nodo));
        if (evento !== null) sonar(evento);
      }
    }
  });
  observador.observe(raiz, { childList: true, subtree: true });
  return () => {
    observador.disconnect();
  };
}
