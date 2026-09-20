import Dashboard from '@/pages/Dashboard';

import { Tablero as TableroDeTienda } from '~/abarrotes/Tablero';
import { AgendaDelDia } from '~/estetica-salon/AgendaDelDia';
import { Tablero as TableroDeCafeteria } from '~/cafeteria/Tablero';
import { Tablero as TableroDeFerreteria } from '~/ferreteria/Tablero';
import { sesionDelServidor } from '~/servidor/http';

/**
 * LA PANTALLA DE INICIO, que no es la misma para los cinco modelos.
 *
 * ── Por qué aquí se decide ─────────────────────────────────────────────────
 * `Dashboard` de `heredado/` es el tablero del RESTAURANTE: se construyó para
 * Restaurante MH y sus nueve indicadores son los de una cena —ventas, costo,
 * utilidad, ticket promedio, la dona de métodos de pago, propinas—. Servírselo a
 * una tiendita no es servirle un tablero genérico: es servirle el de otro negocio,
 * con dos tarjetas que su propia carpeta PROHÍBE (`abarrotes/04-INTERFAZ.md` §4.4:
 * el ticket promedio «se mueve por azar y no dispara nada», y la dona «ocupa más y
 * contesta menos que una lista en 390 px»).
 *
 * La plantilla se lee en el SERVIDOR, de la sesión, y con el HTML baja ya el tablero
 * que toca: sin parpadeo y sin que el navegador tenga que preguntar quién es.
 *
 * ── Y por qué no un `redirect` a una ruta por modelo ───────────────────────
 * Porque `/` es la casa: es lo que el menú lateral enseña como «Inicio» y lo que
 * queda en el historial del navegador. Redirigir metería un salto visible en la
 * pantalla que más se abre, y dejaría dos direcciones para lo mismo.
 *
 * ── Y la estética no tiene tablero en la casa: tiene AGENDA ────────────────
 * Su carpeta dedica una sección entera a defender que **su inicio no es un tablero**
 * (§4.4.1): «a las 9:45 de la mañana, casi todos los indicadores de un dashboard son
 * adornos», y lo único que a esa hora todavía cambia el resultado de hoy —a quién
 * llamo para el hueco de las once— está en la agenda. Así que `/` le sirve su
 * agenda, y su tablero —los ocho indicadores de su §4.4.2, con la ocupación de mañana
 * como estrella— vive donde su carpeta lo pone: dentro de Reportes.
 *
 * Se SIRVE aquí en vez de redirigir a `/estetica-salon/agenda-del-dia`, y la razón es
 * la misma de arriba más una: ese grupo de rutas no monta el `AppLayout` del heredado,
 * así que un redirect dejaría a la dueña en la única pantalla del sistema SIN BARRA
 * LATERAL, y `/` es de donde cuelga el menú entero. La agenda queda en dos
 * direcciones —la casa y su entrada de menú— y es el mismo componente en las dos.
 */
export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const sesion = await sesionDelServidor();

  // Cada plantilla con el suyo. `restaurante` se queda con el heredado porque el
  // heredado ES el suyo: se construyó para Restaurante MH y sus nueve indicadores
  // son los de una cena, uno por uno los de su §4.4.
  if (sesion?.paquete === 'tienda') return <TableroDeTienda />;
  if (sesion?.paquete === 'ferreteria') return <TableroDeFerreteria />;
  if (sesion?.paquete === 'cafeteria') return <TableroDeCafeteria />;

  // Y la estética no tiene tablero en la casa: tiene AGENDA.
  if (sesion?.paquete === 'estetica') return <AgendaDelDia />;

  return <Dashboard />;
}
