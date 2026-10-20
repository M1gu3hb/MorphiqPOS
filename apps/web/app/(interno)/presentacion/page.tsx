'use client';

import { usePOSAuth } from '@/lib/POSAuthContext';
import { PresentacionDelDueno } from '~/configuracion/PresentacionDelDueno';

export default function Pagina() {
  const { posUser, isLoading } = usePOSAuth();
  if (isLoading) return <p>Cargando tu acceso…</p>;
  if (!posUser?.esDuenoGeneral) return <p>Esta sección requiere acceso de dueño general.</p>;
  return <PresentacionDelDueno cfg={{}} />;
}
