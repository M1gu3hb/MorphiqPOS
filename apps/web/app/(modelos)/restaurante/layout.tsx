import type { ReactNode } from 'react';

import { exigirPlantilla } from '~/servidor/plantilla';

/**
 * El restaurante: mapa de mesas, comanda, cocina y arqueo.
 *
 * Estas pantallas son de la plantilla `restaurante` y de ninguna otra. Sin
 * esta guarda, cualquiera con sesión las abría tecleando la ruta y la plantilla
 * dejaba de decidir — que es justo lo que hacía que el acople estuviera a medias.
 */
export const dynamic = 'force-dynamic';

export default async function LayoutDeRestaurante({ children }: { children: ReactNode }) {
  await exigirPlantilla('restaurante');
  return children;
}
