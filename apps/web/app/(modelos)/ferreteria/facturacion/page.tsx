import { Facturacion } from '~/ferreteria/Facturacion';

/**
 * Los datos fiscales y las remisiones que esperan factura.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Facturacion />;
}
