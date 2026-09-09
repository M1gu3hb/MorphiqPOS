import type { ReactNode } from 'react';

import AppLayout from '@/mh/components/common/AppLayout';

/**
 * El cascarón de la aplicación de Miguel: su barra lateral, su fondo de marca
 * y su área de contenido.
 *
 * Todo lo que cuelgue de este grupo de rutas se dibuja dentro de su layout, con
 * su diseño. Las pantallas van entrando aquí conforme se portan.
 */
export default function LayoutMH({ children }: { children: ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
