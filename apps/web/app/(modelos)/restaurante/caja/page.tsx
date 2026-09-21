'use client';

import { useRouter } from 'next/navigation';

import { Caja } from '~/restaurante/Caja';

/**
 * Cobros pendientes: la pantalla de inicio del cajero, donde se elige a quién cobrar.
 *
 * ── ELEGIR A QUIÉN COBRAR NO HACÍA NADA ────────────────────────────────────
 * Esta página montaba `<Caja />` sin `onCobrar`. Cada fila de la lista —«Mesa 7 ·
 * $340»— es un botón que dispara ese callback, así que la pantalla cuyo trabajo
 * entero es ELEGIR una cuenta pintaba la lista y tocarla no hacía nada. El
 * rastreador la encontró tocándolas.
 *
 * Ahora lleva al cobro DE ESA CUENTA. El identificador viaja en la URL y la
 * pantalla de cobro lo lee: sin él tomaba «la primera cuenta solicitada», así que
 * el cajero elegía a Mesa 7 y habría cobrado la que estuviera primero.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  const enrutador = useRouter();

  return (
    <Caja
      onCobrar={(ventaId) => {
        enrutador.push(`/restaurante/cobro?cuenta=${encodeURIComponent(ventaId)}`);
      }}
    />
  );
}
