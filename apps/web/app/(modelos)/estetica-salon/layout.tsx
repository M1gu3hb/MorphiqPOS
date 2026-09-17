import type { ReactNode } from 'react';

import { exigirPlantilla } from '~/servidor/plantilla';

/**
 * La estética: la agenda es el negocio, y termina en la liquidación.
 *
 * Estas pantallas son de la plantilla `estetica` y de ninguna otra. Sin
 * esta guarda, cualquiera con sesión las abría tecleando la ruta y la plantilla
 * dejaba de decidir — que es justo lo que hacía que el acople estuviera a medias.
 */
export const dynamic = 'force-dynamic';

export default async function LayoutDeEsteticaSalon({ children }: { children: ReactNode }) {
  await exigirPlantilla('estetica');
  return children;
}
