import { CatalogoDeServicios } from '~/estetica-salon/CatalogoDeServicios';

/**
 * Los servicios con su duracion como secuencia.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <CatalogoDeServicios />;
}
