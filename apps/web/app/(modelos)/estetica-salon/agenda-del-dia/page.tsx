import { AgendaDelDia } from '~/estetica-salon/AgendaDelDia';

/**
 * La pantalla de inicio del salón: el día completo, para todo el equipo.
 *
 * La página es una línea a propósito — el componente vive en `apps/web/src/`,
 * donde el verificador de primitivas sí vigila los literales.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <AgendaDelDia />;
}
