import { Cortes } from '~/abarrotes/Cortes';

/**
 * El arqueo de la noche y el historico de los cortes.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Cortes />;
}
