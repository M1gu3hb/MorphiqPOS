'use client';

import { useEffect, useId, useSyncExternalStore } from 'react';

import { formatoParaElNavegador } from './clips';
import { pedirTurno, soltarTurno, suscribirAlTurno, tieneTurno } from './turno';

const sinCambios = (): (() => void) => () => undefined;

/** WebM o WebP según el navegador; `null` en el servidor (no sabe quién lo va a ver). */
export function useFormatoDeMorfi(): 'webm' | 'webp' | null {
  return useSyncExternalStore(
    sinCambios,
    () => formatoParaElNavegador(navigator.userAgent, navigator.maxTouchPoints),
    () => null,
  );
}

const CONSULTA = '(prefers-reduced-motion: reduce)';

function suscribirAlMovimiento(avisar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA);
  consulta.addEventListener('change', avisar);
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-movimiento'],
  });
  return () => {
    consulta.removeEventListener('change', avisar);
    observador.disconnect();
  };
}

/**
 * «Reducir movimiento» del sistema operativo, o la perilla `movimiento: nula` del estilo: en los
 * dos casos Morfi se queda en su imagen fija.
 */
export function useSinMovimiento(): boolean {
  return useSyncExternalStore(
    suscribirAlMovimiento,
    () =>
      window.matchMedia(CONSULTA).matches ||
      document.documentElement.getAttribute('data-movimiento') === 'nula',
    () => false,
  );
}

/** Pide el turno de Morfi mientras el componente vive; dice si le toca animarse. */
export function useTurnoDeMorfi(prioridad: number): boolean {
  const id = useId();
  useEffect(() => {
    pedirTurno(id, prioridad);
    return () => {
      soltarTurno(id);
    };
  }, [id, prioridad]);
  return useSyncExternalStore(
    suscribirAlTurno,
    () => tieneTurno(id),
    () => false,
  );
}
