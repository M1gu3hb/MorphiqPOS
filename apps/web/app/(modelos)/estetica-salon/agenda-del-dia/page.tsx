import { AgendaDelDia } from '~/estetica-salon/AgendaDelDia';
import { sesionDelServidor } from '~/servidor/http';
import { veLaListaDeEspera } from '~/servidor/inicio-del-salon';

/**
 * La pantalla de inicio del salón: el día completo, para todo el equipo.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default async function Pagina() {
  // Lo que puede pedir quien entra se decide aquí, en el servidor (`inicio-del-salon`).
  const sesion = await sesionDelServidor();
  return <AgendaDelDia veLaEspera={veLaListaDeEspera(sesion?.rol ?? '')} />;
}
