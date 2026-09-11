import type { ReactNode } from 'react';

import AppLayout from '@/components/common/AppLayout';
import { ProveedorDeContenido } from '@/enrutado';

/**
 * Su `AppLayout`, con su barra lateral y su fondo de marca.
 *
 * En su `App.jsx` esto era `<Route element={<AppLayout />}>` y las páginas
 * entraban por `<Outlet />`. Aquí el hueco lo llena `children`, y para que su
 * `AppLayout` no cambie ni una línea, el `Outlet` del puente del enrutador lo
 * lee de este contexto.
 */
export const dynamic = 'force-dynamic';

export default function LayoutInterno({ children }: { children: ReactNode }) {
  return (
    <ProveedorDeContenido contenido={children}>
      <AppLayout />
    </ProveedorDeContenido>
  );
}
