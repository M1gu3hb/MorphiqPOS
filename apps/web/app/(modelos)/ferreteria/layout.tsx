import type { ReactNode } from 'react';

import { exigirPlantilla } from '~/servidor/plantilla';

/**
 * La ferretería: mostrador por medida, corte, crédito y factura.
 *
 * Estas pantallas son de la plantilla `ferreteria` y de ninguna otra. Sin
 * esta guarda, cualquiera con sesión las abría tecleando la ruta y la plantilla
 * dejaba de decidir — que es justo lo que hacía que el acople estuviera a medias.
 */
export const dynamic = 'force-dynamic';

export default async function LayoutDeFerreteria({ children }: { children: ReactNode }) {
  await exigirPlantilla('ferreteria');
  return children;
}
