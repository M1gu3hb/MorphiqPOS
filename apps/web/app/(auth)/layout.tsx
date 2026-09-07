import type { ReactNode } from 'react';

/**
 * Layout de autenticacion: login del dueno y enrolamiento de terminal.
 *
 * Densidad normal (05-SISTEMA-DE-DISENO §7): es la primera impresion y la
 * escena 1 del guion de demostracion. Las pantallas llegan en F1.1.
 */
export default function LayoutAuth({ children }: { children: ReactNode }) {
  return (
    <div data-densidad="normal" className="min-h-dvh bg-fondo-sutil">
      {children}
    </div>
  );
}
