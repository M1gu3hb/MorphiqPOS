import { Tablero } from '~/estetica-salon/Tablero';

/**
 * El tablero del salón, que vive DENTRO de reportes y no en la raíz.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Tablero />;
}
