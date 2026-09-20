import Dashboard from '@/pages/Dashboard';

import { Tablero as TableroDeTienda } from '~/abarrotes/Tablero';
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
 */
export const dynamic = 'force-dynamic';

export default async function Pagina() {
  const sesion = await sesionDelServidor();

  // `tienda` es el primero que tiene el suyo. Los demás siguen en el tablero
  // heredado —que es el del restaurante— hasta que se construya el de cada uno.
  if (sesion?.paquete === 'tienda') return <TableroDeTienda />;

  return <Dashboard />;
}
