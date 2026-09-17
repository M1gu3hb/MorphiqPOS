import type { ReactNode } from 'react';

import { exigirPlantilla } from '~/servidor/plantilla';

/**
 * La tiendita: se cobra con escáner, se fía y se cuenta el anaquel.
 *
 * Estas pantallas son de la plantilla `tienda` y de ninguna otra. Sin
 * esta guarda, cualquiera con sesión las abría tecleando la ruta y la plantilla
 * dejaba de decidir — que es justo lo que hacía que el acople estuviera a medias.
 */
export const dynamic = 'force-dynamic';

export default async function LayoutDeAbarrotes({ children }: { children: ReactNode }) {
  await exigirPlantilla('tienda');
  return children;
}
