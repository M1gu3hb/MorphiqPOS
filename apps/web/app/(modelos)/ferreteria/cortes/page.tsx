import { Cortes } from '~/abarrotes/Cortes';

/**
 * El arqueo a ciegas y el corte de la ferretería, heredados de abarrotes (§PANTALLA 9).
 * Sin esta dirección la ferretería no podía cerrar su caja desde el sistema (C.6 de la 2.4).
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Cortes rutaDeCaja="/ferreteria/fondo-y-movimientos" />;
}
