import { FichaDePieza } from '~/ferreteria/FichaDePieza';

/**
 * La ficha ampliada de una pieza, para el mostradorista que ya no resuelve con
 * la tabla: foto con escala, medida en pulgada y milímetro, y AGREGAR A LA VENTA.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <FichaDePieza />;
}
