'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { TECLA_DE_OMISION, type SonidoDeTecla } from '~/sonidos/mapa';

/**
 * LA EXPERIENCIA DEL NEGOCIO EN VIVO (DP-11): «Mascota Morfi», «Pedir PIN al despertar» y los
 * sonidos del negocio (el del teclado y si el portal suena).
 *
 * El servidor la lee al pintar (`app/layout.tsx`, de `configuracion.valores.experiencia`) y la
 * pasa aquí, como la apariencia: la primera pintura ya sabe si Morfi sale. `cambiar` la ajusta
 * en la pestaña al guardarla en Configuración, sin recargar.
 */
export interface ExperienciaDelNegocio {
  readonly mascota: boolean;
  readonly pin_al_despertar: boolean;
  /** DP-11.3: si el portal del comensal suena. */
  readonly sonidos_en_el_portal: boolean;
  /** DP-11.3: con qué suena el teclado de PIN y de números. */
  readonly tecla: SonidoDeTecla;
}

export const EXPERIENCIA_DE_OMISION: ExperienciaDelNegocio = {
  mascota: true,
  pin_al_despertar: false,
  sonidos_en_el_portal: false,
  tecla: TECLA_DE_OMISION,
};

interface ExperienciaEnVivo {
  readonly experiencia: ExperienciaDelNegocio;
  readonly cambiar: (nueva: ExperienciaDelNegocio) => void;
  /** La zona horaria del negocio (`organizaciones.zona_horaria`): la hora del modo espera. */
  readonly zona: string;
}

/** La de los negocios que no dicen otra (la columna nace con ella). */
export const ZONA_DE_OMISION = 'America/Mexico_City';

const Contexto = createContext<ExperienciaEnVivo | null>(null);

export function ProveedorDeExperiencia({
  inicial,
  zona = ZONA_DE_OMISION,
  children,
}: {
  readonly inicial: ExperienciaDelNegocio;
  readonly zona?: string;
  readonly children: ReactNode;
}) {
  const [experiencia, cambiar] = useState(inicial);
  const valor = useMemo(() => ({ experiencia, cambiar, zona }), [experiencia, zona]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Fuera del proveedor (una prueba de una pieza suelta) se lee la de omisión: Morfi es un adorno
 * y no tiene por qué tumbar una pantalla.
 */
export function useExperiencia(): ExperienciaEnVivo {
  return (
    useContext(Contexto) ?? {
      experiencia: EXPERIENCIA_DE_OMISION,
      cambiar: () => undefined,
      zona: ZONA_DE_OMISION,
    }
  );
}
