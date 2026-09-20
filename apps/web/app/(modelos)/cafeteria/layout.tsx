import type { ReactNode } from 'react';

import { exigirPlantilla } from '~/servidor/plantilla';

/**
 * La cafetería de mostrador: se cobra de pie y la barra llama por nombre.
 *
 * Estas pantallas son de la plantilla `cafeteria` y de ninguna otra. Sin
 * esta guarda, cualquiera con sesión las abría tecleando la ruta y la plantilla
 * dejaba de decidir — que es justo lo que hacía que el acople estuviera a medias.
 */
export const dynamic = 'force-dynamic';

export default async function LayoutDeCafeteria({ children }: { children: ReactNode }) {
  await exigirPlantilla('cafeteria');
  return children;
}
