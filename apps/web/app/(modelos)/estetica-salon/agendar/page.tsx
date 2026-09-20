import { Agendar } from '~/estetica-salon/Agendar';

/**
 * Agendar una cita: la clienta, el servicio, la profesional y el hueco.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/`
 * —donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Agendar />;
}
