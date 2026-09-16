import { Existencias } from '~/abarrotes/Existencias';

/**
 * El anaquel de la tiendita: qué hay, qué falta y qué se vence. Para el
 * encargado y el dueño, varias veces al día.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Existencias />;
}
