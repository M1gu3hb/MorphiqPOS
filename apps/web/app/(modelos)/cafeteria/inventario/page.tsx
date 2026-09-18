import { Inventario } from '~/cafeteria/Inventario';

/**
 * Qué hay, cuántos días alcanza y qué se fue: la pantalla del barista que
 * repone y de la dueña que decide si hay que salir por leche.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Inventario />;
}
