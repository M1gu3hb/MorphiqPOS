import { Entradas } from '~/ferreteria/Entradas';

/**
 * Recepción y pedido de la ferretería: la pantalla del encargado o del almacén
 * cuando llega la nota del proveedor y cuando toca volver a pedir.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Entradas />;
}
