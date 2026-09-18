import { Servicios } from '~/abarrotes/Servicios';

/**
 * Recargas y pago de servicios de la tiendita: el cajero cobra dinero ajeno y
 * el dueño mira, desde el teléfono, cuánta comisión lleva del día.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Servicios />;
}
