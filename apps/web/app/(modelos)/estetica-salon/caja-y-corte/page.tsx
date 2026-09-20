import { CajaYCorte } from '~/estetica-salon/CajaYCorte';

/**
 * El cierre del dia, con las liquidaciones dentro del corte.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <CajaYCorte />;
}
