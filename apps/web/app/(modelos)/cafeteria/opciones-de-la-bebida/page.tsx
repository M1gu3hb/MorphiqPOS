import { OpcionesDeLaBebida } from '~/cafeteria/OpcionesDeLaBebida';

/**
 * Las opciones de la bebida —leche, temperatura, shots— antes de mandarla a barra.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/`
 * —donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <OpcionesDeLaBebida />;
}
