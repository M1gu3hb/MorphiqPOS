import { MesaActiva } from '~/restaurante/MesaActiva';

/**
 * La mesa abierta: donde el mesero levanta el pedido y lo manda a cocina.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/`
 * —donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta. La mesa llega por `?mesa=<id>`.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <MesaActiva />;
}
