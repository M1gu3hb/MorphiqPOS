import { FichaDelProfesional } from '~/estetica-salon/FichaDelProfesional';

/**
 * Mi dia: lo que la estilista mira entre clienta y clienta, de pie.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <FichaDelProfesional profesionalId="" />;
}
