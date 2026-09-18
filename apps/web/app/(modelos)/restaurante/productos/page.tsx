import { Productos } from '~/restaurante/Productos';

/**
 * El catálogo del restaurante, para quien lo mantiene: dueño, administrador o
 * gerente. La página es una línea a propósito —el componente vive en
 * `apps/web/src/`, donde el verificador de primitivas sí vigila los literales— y
 * aquí sólo se dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Productos />;
}
