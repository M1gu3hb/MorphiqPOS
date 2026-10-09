import PortalCliente from '@/pages/PortalCliente';

/**
 * PANTALLA · restaurante · portal-del-comensal
 *
 * UN SOLO PORTAL DEL COMENSAL (C.11 de la 2.4, D-25): el de Miguel, `PortalCliente`, que
 * es el que abre el QR de la mesa en `/qr/[token]`. Había dos —éste pintaba otro
 * componente, `PortalDelComensal`, sin pedido desde la mesa, sin carrito y sin la propina
 * en vivo— y ninguno de los dos comensales llegaba al segundo: el QR lleva a `/qr/[token]`.
 * Queda el que tiene las funciones del de Miguel, que desde la 2.4 pinta con los tokens del
 * estilo (C.16, D-19).
 *
 * Aquí, sin token en la dirección, enseña lo que enseña a quien llega sin código: «Mesa no
 * encontrada · llama a un mesero». Es la ruta que declara el modelo; la del comensal es la
 * del QR.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <PortalCliente />;
}
