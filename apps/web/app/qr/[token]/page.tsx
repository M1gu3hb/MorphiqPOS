import PortalCliente from '@/pages/PortalCliente';

/**
 * El portal del comensal. Público: sin barra lateral y sin sesión interna.
 * La URL es la suya, `/qr/:token`.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <PortalCliente />;
}
