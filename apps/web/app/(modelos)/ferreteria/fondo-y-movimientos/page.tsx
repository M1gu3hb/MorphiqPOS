import { Caja } from '~/abarrotes/Caja';

/**
 * El fondo del cajón, la entrada de cambio y los retiros de la ferretería.
 *
 * Su documento lo hereda de abarrotes (§PANTALLA 9, «Caja y corte»), y hasta la 2.4 no
 * tenía dirección: la ferretería no podía abrir su caja desde el sistema —sus pruebas la
 * abrían por la API—, y sin caja abierta no hay cobro. «Caja» de la ferretería es el cobro
 * de notas; esto es el cajón (C.6 de la 2.4).
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Caja rutaDeCortes="/ferreteria/cortes" />;
}
