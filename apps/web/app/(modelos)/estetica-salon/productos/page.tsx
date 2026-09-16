import { Productos } from '~/estetica-salon/Productos';

/**
 * El doble destino del mismo bote: anaquel y cabina.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Productos almacenVentaId="" almacenCabinaId="" />;
}
