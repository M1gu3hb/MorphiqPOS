import { Cobrar } from '~/abarrotes/Cobrar';

/**
 * La pantalla de inicio del mostrador: se cobra, y todo lo demás cuelga de aquí.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/`
 * —donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Cobrar />;
}
