import { AccesoPorPin } from '~/restaurante/AccesoPorPin';

/**
 * La puerta del turno: quien va a operar la caja dice quién es y teclea su PIN.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/`
 * —donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <AccesoPorPin />;
}
