import { PortalDelComensal } from '~/restaurante/PortalDelComensal';

/**
 * El portal del comensal, montado SIN token: aquí sólo se alcanza su vacío.
 *
 * Quien escanea el QR de la mesa NO llega aquí: el código lleva a `/qr/[token]`,
 * que todavía pinta el `PortalCliente` heredado. Así que la carta, la cuenta, la
 * barra de atención, el esqueleto y el error de `PortalDelComensal` hoy no los ve
 * ningún comensal y sólo se ejercitan con `datosIniciales`. Pasar `/qr/[token]` a
 * esta pantalla, con el token del segmento, es decisión de quien integra: es la
 * ruta pública de los negocios que ya cobran.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <PortalDelComensal token="" />;
}
