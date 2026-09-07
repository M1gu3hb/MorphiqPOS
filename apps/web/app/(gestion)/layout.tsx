import type { ReactNode } from 'react';

/**
 * Layout de gestion: inicio, productos, inventario, compras, configuracion.
 *
 * Densidad normal. Lo ve quien decide la compra, asi que aqui manda la claridad
 * sobre la velocidad. La navegacion lateral llega en F1.1.
 */
export default function LayoutGestion({ children }: { children: ReactNode }) {
  return (
    <div data-densidad="normal" className="min-h-dvh bg-fondo">
      {children}
    </div>
  );
}
