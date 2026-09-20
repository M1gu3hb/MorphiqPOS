import { Liquidacion } from '~/estetica-salon/Liquidacion';

/**
 * El dia de pago: lo que se le debe a cada quien, renglon por renglon.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Liquidacion />;
}
