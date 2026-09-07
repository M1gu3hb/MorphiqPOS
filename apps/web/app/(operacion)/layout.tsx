import type { ReactNode } from 'react';

/**
 * Layout de operacion: venta, escaner, mesero, cocina, caja.
 *
 * Estas cinco rutas comparten requisitos que las demas no tienen —velocidad,
 * tiempo real, tablet, densidad compacta, cero renderizado de servidor— y por
 * eso viven agrupadas (02-ESTRATEGIA §4, operacion 6).
 *
 * Densidad compacta por omision, que es la de escritorio. En tablet el proveedor
 * de densidad la sube a comoda; se resuelve en F1.2 con el layout de operacion
 * completo.
 */
export default function LayoutOperacion({ children }: { children: ReactNode }) {
  return (
    <div data-densidad="compacta" className="min-h-dvh bg-fondo">
      {children}
    </div>
  );
}
