import { MenuPublicoYPedidoAnticipado } from '~/cafeteria/MenuPublicoYPedidoAnticipado';

/**
 * El menu que ve el cliente en su telefono y el pedido que deja apartado.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <MenuPublicoYPedidoAnticipado />;
}
