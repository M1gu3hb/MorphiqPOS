import { ClientesYSellos } from '~/cafeteria/ClientesYSellos';

/**
 * La tarjeta de sellos: identificar por telefono, ver el saldo y canjear.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <ClientesYSellos />;
}
