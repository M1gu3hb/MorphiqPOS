import { Barra } from '~/cafeteria/Barra';

/**
 * El tablero del barista: lo que hay que preparar y en qué orden llegó.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Barra />;
}
