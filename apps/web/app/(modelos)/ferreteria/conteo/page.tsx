import { Conteo } from '~/ferreteria/Conteo';

/**
 * Contar por peso, con su rango de confianza.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Conteo tomaId="" />;
}
