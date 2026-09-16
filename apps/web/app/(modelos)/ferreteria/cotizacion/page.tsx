import { Cotizacion } from '~/ferreteria/Cotizacion';

/**
 * La cotización de obra del encargado o del dueño: 40 partidas, vigencia y envío.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Cotizacion />;
}
