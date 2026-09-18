import { AltaRapida } from '~/abarrotes/AltaRapida';

/**
 * El alta rápida de producto de la tiendita: convierte un «no está en el
 * catálogo» en una venta y en un alta, sin sacar al cajero de la caja.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <AltaRapida />;
}
