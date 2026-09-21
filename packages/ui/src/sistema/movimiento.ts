/**
 * MOVIMIENTO · que se unan, que se separen, que se expandan.
 *
 * Miguel lo pidió con esas palabras. Lo que describen es una sola cosa: que el
 * elemento que se toca y el que aparece después **sean el mismo objeto**, y que el
 * ojo pueda seguirlo. Un producto que salta del catálogo al carrito, una mesa que se
 * expande hasta ser la cuenta completa, una fila de tabla que se convierte en el
 * panel de detalle.
 *
 * ── Cómo, y por qué así ───────────────────────────────────────────────────
 * Con **View Transitions del navegador**: se le da el MISMO `view-transition-name` a
 * la pieza de origen y a la de destino, y el navegador interpola posición, tamaño y
 * forma entre las dos. No hay que medir cajas, ni clonar nodos, ni animar en el hilo
 * principal: la animación corre fuera de él, que es la diferencia entre fluida y a
 * tirones cuando la pantalla está cargando datos.
 *
 * No se usa el componente `<ViewTransition>` de React porque **no existe en React
 * estable** —es de la rama canary— y este proyecto corre 19.2.8. La API del
 * navegador sí existe, hace exactamente lo mismo para este caso, y donde no existe
 * el cambio ocurre igual sin animación. Eso no es un apaño: es progresivo.
 *
 * ── Tres duraciones y dos curvas. No más ──────────────────────────────────
 * Las duraciones salen de la perilla `data-movimiento` (`--duracion-rapida`,
 * `--duracion-normal`, `--duracion-lenta`) y las curvas de `--curva-entrada` y
 * `--curva-salida`. Un sistema con siete curvas no se siente rico: se siente
 * inconsistente, porque nadie distingue siete y todo el mundo nota que no son la
 * misma.
 *
 * ── Y nada se mueve debajo del dedo ───────────────────────────────────────
 * Estas transiciones son entre PANTALLAS o entre estados grandes. Lo que nunca se
 * anima es la posición de algo que se está a punto de tocar: una animación que
 * desplaza un botón mientras alguien va a pulsarlo es un error, no un detalle.
 */

/** Los viajes que el sistema reconoce. El nombre viaja en el CSS. */
export const VIAJE = {
  /** El producto que salta del catálogo al carrito. */
  producto: (id: string) => `producto-${id}`,
  /** La mesa que se expande hasta ser la cuenta completa. */
  mesa: (id: string) => `mesa-${id}`,
  /** La cita que se abre desde la agenda. */
  cita: (id: string) => `cita-${id}`,
  /** La fila de la tabla que se convierte en panel de detalle. */
  fila: (id: string) => `fila-${id}`,
  /** El lienzo de la pantalla, para el cambio dentro del mismo modelo. */
  pantalla: () => 'pantalla',
} as const;

/**
 * El estilo que marca una pieza como parte de un viaje.
 *
 * Se pone en el ORIGEN y en el DESTINO con el mismo nombre. Y sólo puede haber uno
 * montado con ese nombre a la vez: dos elementos con `producto-7` en pantalla a la
 * vez dejan al navegador sin saber cuál es cuál, y no anima ninguno.
 */
export function viaje(nombre: string): { readonly viewTransitionName: string } {
  return { viewTransitionName: nombre };
}

/** ¿Quien mira ha pedido que no se mueva nada? */
function prefiereQuietud(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * La parte de `document` que interesa aquí.
 *
 * No extiende `Document` a propósito: las definiciones del DOM de TypeScript 6 ya
 * declaran `startViewTransition` con una firma más ancha —acepta también un objeto
 * con tipos de transición— y volver a declararla aquí choca con ella. Lo que hace
 * falta es saber SI existe, y para eso basta mirar la propiedad.
 */
interface DocumentoConTransiciones {
  readonly startViewTransition?: (cambio: () => void | Promise<void>) => {
    readonly finished: Promise<void>;
  };
}

/**
 * Hace el cambio DENTRO de una transición, si se puede.
 *
 * Se puede cuando: el navegador la soporta y quien mira no ha pedido quietud. En
 * cualquier otro caso el cambio ocurre igual, sin animación y sin ruido — que es lo
 * que tiene que pasar, porque la animación nunca es el punto: el cambio sí.
 *
 * Devuelve una promesa que se resuelve cuando la animación termina, para el caso en
 * que haya que encadenar algo. No hay que esperarla para que el cambio ocurra.
 */
export async function conTransicion(cambio: () => void | Promise<void>): Promise<void> {
  const documento =
    typeof document === 'undefined'
      ? null
      : (document as unknown as DocumentoConTransiciones);

  if (documento?.startViewTransition === undefined || prefiereQuietud()) {
    await cambio();
    return;
  }

  try {
    await documento.startViewTransition(cambio).finished;
  } catch {
    // Una transición que se interrumpe —porque llegó otra navegación— no es un
    // error que nadie deba ver: el cambio ya ocurrió, que es lo que importaba.
  }
}
