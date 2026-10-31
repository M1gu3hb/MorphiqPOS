'use client';

import { useEffect } from 'react';

/**
 * Que la pantalla del teléfono no se apague mientras cocina (Wake Lock). El navegador la suelta
 * al cambiar de app o de pestaña: se vuelve a pedir al regresar. Sin Wake Lock (navegadores
 * viejos) no pasa nada: la página sigue funcionando y BOTONERA.md dice cómo quitar el ahorro.
 */
export function usePantallaEncendida(activa: boolean): void {
  useEffect(() => {
    if (!activa || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let candado: WakeLockSentinel | null = null;
    let vigente = true;
    const pedir = (): void => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (nuevo) => {
          if (vigente) candado = nuevo;
          else void nuevo.release();
        },
        () => {
          // Negado (ahorro de batería, permiso): la pantalla se apaga como siempre.
          candado = null;
        },
      );
    };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => {
      vigente = false;
      document.removeEventListener('visibilitychange', pedir);
      if (candado !== null) void candado.release();
    };
  }, [activa]);
}
