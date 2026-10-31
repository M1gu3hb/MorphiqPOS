'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * LA EXPERIENCIA DEL NEGOCIO EN VIVO (DP-11): «Mascota Morfi» y lo que venga.
 *
 * El servidor la lee al pintar (`app/layout.tsx`, de `configuracion.valores.experiencia`) y la
 * pasa aquí, como la apariencia: la primera pintura ya sabe si Morfi sale. `cambiar` la ajusta
 * en la pestaña al guardarla en Configuración, sin recargar.
 */
export interface ExperienciaDelNegocio {
  readonly mascota: boolean;
}

export const EXPERIENCIA_DE_OMISION: ExperienciaDelNegocio = { mascota: true };

interface ExperienciaEnVivo {
  readonly experiencia: ExperienciaDelNegocio;
  readonly cambiar: (nueva: ExperienciaDelNegocio) => void;
}

const Contexto = createContext<ExperienciaEnVivo | null>(null);

export function ProveedorDeExperiencia({
  inicial,
  children,
}: {
  readonly inicial: ExperienciaDelNegocio;
  readonly children: ReactNode;
}) {
  const [experiencia, cambiar] = useState(inicial);
  const valor = useMemo(() => ({ experiencia, cambiar }), [experiencia]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Fuera del proveedor (una prueba de una pieza suelta) se lee la de omisión: Morfi es un adorno
 * y no tiene por qué tumbar una pantalla.
 */
export function useExperiencia(): ExperienciaEnVivo {
  return useContext(Contexto) ?? { experiencia: EXPERIENCIA_DE_OMISION, cambiar: () => undefined };
}
