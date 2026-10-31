'use client';

import { useSyncExternalStore } from 'react';

import { almacenDelAparato } from '~/restaurante/vista-de-solicitudes';

/**
 * LO GUARDADO EN ESTE APARATO, EN VIVO (DP-11.2 y 11.3): el modo espera y los sonidos de este
 * aparato se leen del almacén del navegador y se pintan con `useSyncExternalStore`. Quien guarda
 * aquí avisa a esta pestaña con `avisarCambioDelAparato`; las otras pestañas se enteran solas por
 * el evento `storage`.
 *
 * Se lee el TEXTO guardado, no un objeto: así la instantánea no cambia de identidad en cada
 * lectura. En el servidor no hay almacén: `null`, y cada quien pinta lo de omisión.
 */
const oyentes = new Set<() => void>();

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar);
  window.addEventListener('storage', avisar);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener('storage', avisar);
  };
}

function textoDe(clave: string): string | null {
  try {
    return almacenDelAparato()?.getItem(clave) ?? null;
  } catch {
    // Datos del sitio bloqueados: como si no hubiera nada guardado.
    return null;
  }
}

export function useTextoDelAparato(clave: string): string | null {
  return useSyncExternalStore(
    suscribir,
    () => textoDe(clave),
    () => null,
  );
}

export function avisarCambioDelAparato(): void {
  for (const avisar of oyentes) avisar();
}
