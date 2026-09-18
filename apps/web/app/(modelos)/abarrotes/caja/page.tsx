import { Caja } from '~/abarrotes/Caja';

/**
 * Abrir el cajón, meterle cambio y sacar lo que se lleva al banco.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Caja />;
}
