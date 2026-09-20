import { Conteo } from '~/abarrotes/Conteo';

/**
 * El conteo cíclico del anaquel, para el encargado, de pie y con el teléfono.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Conteo />;
}
