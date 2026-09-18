import { MapaDeMesas } from '~/restaurante/MapaDeMesas';

/**
 * La pantalla de inicio del mesero.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/` —
 * donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta. Así, al acoplar, mover la pantalla dentro del
 * `AppLayout` de Miguel es cambiar este archivo y ninguno más.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <MapaDeMesas />;
}
