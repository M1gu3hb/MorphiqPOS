'use client';

import { CierreDiario } from '~/restaurante/CierreDiario';

/**
 * El cierre del día y el arqueo del cajón.
 *
 * ── EL BOTÓN DEL COMPROBANTE NO HACÍA NADA, Y ADEMÁS PROMETÍA UN PDF ───────
 * Montaba `<CierreDiario />` sin callback, así que «Descargar el PDF del cierre»
 * —el botón grande que sale cuando el arqueo ya cuadró— no hacía absolutamente
 * nada. Y el PDF no existe en ninguna parte del sistema: el único formato de
 * exporte es `csv`. Dos promesas incumplidas en un botón.
 *
 * Ahora se llama «Imprimir el cierre» y abre el diálogo de impresión del
 * navegador, que es lo que un negocio pequeño usa para guardarlo en PDF o para
 * sacarlo en papel y pegarlo en la carpeta del día.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return (
    <CierreDiario
      onImprimirElCierre={() => {
        window.print();
      }}
    />
  );
}
