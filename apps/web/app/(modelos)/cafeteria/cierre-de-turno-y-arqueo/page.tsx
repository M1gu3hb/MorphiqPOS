import { CierreDeTurno } from '~/cafeteria/CierreDeTurno';

/**
 * El cierre del turno de barra: lo que entró, lo que se contó y la diferencia.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/`
 * —donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <CierreDeTurno />;
}
