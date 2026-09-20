import { Producto } from '~/abarrotes/Producto';

/**
 * La ficha del producto: precio, margen, presentaciones e impuesto.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Producto productoId="" />;
}
