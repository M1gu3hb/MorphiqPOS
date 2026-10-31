'use client';

import { useEffect, useEffectEvent, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const TECLAS = ['keydown', 'keypress', 'keyup'] as const;

/**
 * Abre el diálogo en la capa superior. Un navegador sin `showModal` (Safari antes de 15.4) la
 * deja abierta como diálogo normal: se ve igual, aunque lo de abajo no quede inerte.
 */
function abrirComoModal(dialogo: HTMLDialogElement): void {
  if (dialogo.open) return;
  if (typeof dialogo.showModal === 'function') dialogo.showModal();
  else dialogo.setAttribute('open', '');
}

/**
 * UNA CAPA EN LA CAPA SUPERIOR DEL NAVEGADOR (DP-11.2): un `<dialog>` abierto con `showModal`.
 *
 * El modo espera y el PIN no pueden ser un `div` con `z-index`: un diálogo de Radix abierto
 * debajo deja el `body` sin toques y se queda con el foco, un aviso de Sonner o la vista de un
 * reporte quedan encima, y el Tab llega a la pantalla de abajo. La capa superior resuelve todo de
 * una: va encima de cualquier cosa, el resto de la página queda inerte y, al cerrarse, el foco
 * vuelve a donde estaba.
 *
 * NADA DE LO QUE PASA EN LA CAPA SALE DE ELLA, porque la pantalla de abajo tiene que volver tal
 * cual: un diálogo de Radix abierto debajo se cierra si ve el foco, un toque o Escape fuera de él
 * (y con él lo tecleado en su formulario), y hay atajos que escuchan toda la ventana (F12 cobra).
 * El foco y el dedo se detienen en la capa; el teclado, en la ventana misma antes que nadie, y
 * sólo se le pasa a quien montó la capa (`alTeclear`). Ni Escape ni el gesto Atrás la cierran: la
 * quita quien la monta.
 *
 * Va en un portal, hijo directo del `<body>`: Radix marca con `aria-hidden` todo lo que no es su
 * diálogo, y dentro del árbol de la pantalla la capa se veía pero no existía para un lector de
 * pantalla. `pointer-events-auto` porque la propiedad se hereda por el DOM y Radix deja el `body`
 * en `none` mientras su diálogo está abierto.
 */
export function CapaModal({
  etiqueta,
  className,
  alTocar,
  alTeclear,
  children,
  ...datos
}: {
  readonly etiqueta: string;
  readonly className?: string;
  readonly alTocar?: () => void;
  readonly alTeclear?: (evento: KeyboardEvent) => void;
  readonly children: ReactNode;
  readonly [dato: `data-${string}`]: string | undefined;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  // De diseño (`useLayoutEffect`): se cierra ANTES de que React lo quite del DOM. Un diálogo
  // quitado sin cerrarse no devuelve el foco.
  useLayoutEffect(() => {
    const actual = dialogo.current;
    if (actual === null) return undefined;
    const quedarse = (evento: Event): void => {
      evento.stopPropagation();
    };
    // Mientras esté montada, la capa no se cierra sola. `closedby="none"`: ni Escape ni el gesto
    // Atrás de Android. Y si el navegador la cierra de todos modos (el que no conoce `closedby`
    // deja cancelar UNA petición de cierre, no dos seguidas), se vuelve a abrir: si no, el PIN
    // quedaría saltado con Atrás, Atrás.
    const reabrir = (): void => {
      abrirComoModal(actual);
    };
    actual.setAttribute('closedby', 'none');
    actual.addEventListener('focusin', quedarse);
    actual.addEventListener('pointerdown', quedarse);
    actual.addEventListener('close', reabrir);
    abrirComoModal(actual);
    return () => {
      actual.removeEventListener('focusin', quedarse);
      actual.removeEventListener('pointerdown', quedarse);
      actual.removeEventListener('close', reabrir);
      if (actual.open) actual.close();
    };
  }, []);

  const teclear = useEffectEvent((evento: KeyboardEvent): void => {
    alTeclear?.(evento);
  });
  useEffect(() => {
    const atrapar = (evento: KeyboardEvent): void => {
      if (evento.type === 'keydown') teclear(evento);
      evento.stopPropagation();
    };
    for (const tipo of TECLAS) window.addEventListener(tipo, atrapar, { capture: true });
    return () => {
      for (const tipo of TECLAS) window.removeEventListener(tipo, atrapar, { capture: true });
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogo}
      aria-label={etiqueta}
      onCancel={(evento) => {
        evento.preventDefault();
      }}
      onClick={alTocar}
      className={`pointer-events-auto fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden border-0 bg-espera-fondo p-0 text-espera-texto outline-none backdrop:bg-espera-fondo ${className ?? ''}`}
      {...datos}
    >
      {children}
    </dialog>,
    document.body,
  );
}
