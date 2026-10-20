import { CitaEnCurso } from '~/estetica-salon/CitaEnCurso';
import { quienVeElCosto } from '~/servidor/costo-de-la-cita';
import { sesionDelServidor } from '~/servidor/http';

/**
 * La cita abierta, con la fórmula de la visita anterior a un toque.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/`
 * —donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default async function Pagina() {
  // Qué parte del costo de la cita puede leer quien entra, decidido aquí en el servidor: la
  // estilista no lee ni la receta ni la cotización, así que ni se le piden.
  const sesion = await sesionDelServidor();
  return <CitaEnCurso costos={quienVeElCosto(sesion?.rol ?? '')} />;
}
