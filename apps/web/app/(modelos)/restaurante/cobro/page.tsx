'use client';

import { useSearchParams } from 'next/navigation';

import { Cobro } from '~/restaurante/Cobro';

/**
 * El cobro de una cuenta cerrada, para el cajero.
 *
 * ── DOS CABOS SUELTOS QUE ESTA PÁGINA ATA ──────────────────────────────────
 * 1 · LA CUENTA. Montaba `<Cobro />` a secas, y el componente tomaba «la primera
 *     cuenta solicitada». Con la lista de Caja delante eso es una lotería: el
 *     cajero toca Mesa 7 y cobra la que estuviera primero. Ahora el
 *     identificador viaja en `?cuenta=` y la pantalla cobra ESA.
 * 2 · «IMPRIMIR TICKET». El botón que sale al terminar llamaba `onImprimir?.()` y
 *     nadie pasaba el callback: cobrabas y el ticket no se imprimía. El sistema no
 *     tiene generador de PDF ni cola de impresión —`FORMATOS` de reportes sólo
 *     tiene `csv`—, así que lo que hace es lo que hace un POS pequeño: abrir el
 *     diálogo de impresión del navegador, que también sabe guardar en PDF.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  const parametros = useSearchParams();
  const cuenta = parametros.get('cuenta');

  // `exactOptionalPropertyTypes` no admite pasar `undefined` a una propiedad
  // opcional: o se pasa un valor, o no se pasa la propiedad.
  const imprimir = () => {
    window.print();
  };
  return cuenta === null || cuenta === '' ? (
    <Cobro onImprimir={imprimir} />
  ) : (
    <Cobro cuentaId={cuenta} onImprimir={imprimir} />
  );
}
