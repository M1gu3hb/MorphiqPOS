import { Recetas } from '~/restaurante/Recetas';

/**
 * El recetario del restaurante: de qué está hecho cada platillo y cuánto deja.
 * La usa el dueño, a ráfagas, cuando configura la carta o revisa márgenes.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Recetas />;
}
