import { Cobrar } from '~/estetica-salon/Cobrar';

/**
 * El cobro del salón: para recepción, o para la propia profesional.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Cobrar />;
}
