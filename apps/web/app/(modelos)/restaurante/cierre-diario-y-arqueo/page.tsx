'use client';

import { CierreDiario } from '~/restaurante/CierreDiario';

/**
 * El cierre del día y el arqueo del cajón.
 *
 * El comprobante es el PDF del corte (§9.3 del restaurante, C.6 de la 2.4): la pantalla lo
 * arma con la hoja del servidor y lo baja sola al cerrar. Aquí iba `window.print()` como
 * sustituto —imprimía la PANTALLA, no un corte—, porque el sistema no tenía generador.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <CierreDiario />;
}
