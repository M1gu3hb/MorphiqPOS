import { Existencias } from '~/ferreteria/Existencias';

/**
 * Qué hay, qué está dormido y qué está abierto: la pantalla de consulta del
 * encargado, el dueño y el almacén.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Existencias />;
}
