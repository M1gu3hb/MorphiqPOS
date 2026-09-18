import { Registros } from '~/abarrotes/Registros';

/**
 * Que paso: ventas, caja e inventario en una sola linea de tiempo.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Registros />;
}
