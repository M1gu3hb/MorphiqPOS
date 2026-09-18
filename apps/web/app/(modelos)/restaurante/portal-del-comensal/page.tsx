import { PortalDelComensal } from '~/restaurante/PortalDelComensal';

/**
 * Lo que ve quien escanea el codigo de la mesa: el menu y su cuenta.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <PortalDelComensal token="" />;
}
