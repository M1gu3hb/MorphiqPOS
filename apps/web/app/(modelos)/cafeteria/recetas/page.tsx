import { Recetas } from '~/cafeteria/Recetas';

/**
 * Que lleva cada bebida y cuanto cuesta de verdad, por canal.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Recetas />;
}
