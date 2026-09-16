import { Material } from '~/ferreteria/Material';

/**
 * El material continuo: los rollos abiertos, lo que queda y el corte.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Material productoId="" almacenId="" />;
}
