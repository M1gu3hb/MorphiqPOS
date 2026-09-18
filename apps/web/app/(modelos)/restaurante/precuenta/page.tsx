import { Precuenta } from '~/restaurante/Precuenta';

/**
 * La precuenta del mesero: la hoja que el comensal revisa antes de pagar.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales, y aquí sólo se
 * dice en qué ruta se monta. La cuenta a imprimir llega por `?cuenta=<id>`.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <Precuenta />;
}
