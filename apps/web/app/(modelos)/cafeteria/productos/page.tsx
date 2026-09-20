import { Productos } from '~/cafeteria/Productos';

/**
 * El catalogo de la barra, con el margen de cada canal al lado del otro.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Productos />;
}
