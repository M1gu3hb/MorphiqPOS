import type { ReactNode } from 'react';

import AppLayout from '@/components/common/AppLayout';
import { ProveedorDeContenido } from '@/enrutado';
import { ProveedorDeVocabulario } from '~/cliente/vocabulario';
import { terminosDelServidor } from '~/servidor/vocabulario';

/**
 * Su `AppLayout`, con su barra lateral y su fondo de marca.
 *
 * En su `App.jsx` esto era `<Route element={<AppLayout />}>` y las páginas
 * entraban por `<Outlet />`. Aquí el hueco lo llena `children`, y para que su
 * `AppLayout` no cambie ni una línea, el `Outlet` del puente del enrutador lo
 * lee de este contexto.
 *
 * ── Por qué el vocabulario también entra aquí ───────────────────────
 * Porque ÉSTE es el punto de venta que los cuatro negocios usan todos los días.
 * Enganchar F-017 sólo a las 61 pantallas nuevas habría dejado el vocabulario
 * donde menos se ve: el menú, la barra lateral y las pantallas que Miguel abre
 * cada mañana seguirían diciendo «mesa» en una ferretería.
 *
 * El marco no cambia ni una clase: el proveedor no pinta nada, sólo pone el
 * valor a disposición de quien lo pida. `verify:aspecto` lo confirma.
 */
export const dynamic = 'force-dynamic';

export default async function LayoutInterno({ children }: { children: ReactNode }) {
  const terminos = await terminosDelServidor();

  return (
    <ProveedorDeVocabulario terminos={terminos}>
      <ProveedorDeContenido contenido={children}>
        <AppLayout />
      </ProveedorDeContenido>
    </ProveedorDeVocabulario>
  );
}
