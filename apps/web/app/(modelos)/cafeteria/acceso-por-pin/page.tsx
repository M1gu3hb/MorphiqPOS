import { AccesoPorPin } from '~/cafeteria/AccesoPorPin';

/**
 * La puerta del turno en la barra: quién opera y su PIN.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <AccesoPorPin />;
}
