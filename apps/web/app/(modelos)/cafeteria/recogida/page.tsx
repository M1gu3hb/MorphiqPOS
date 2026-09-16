import { Recogida } from '~/cafeteria/Recogida';

/**
 * El monitor de la barra, para el cliente que está esperando de pie.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Recogida />;
}
