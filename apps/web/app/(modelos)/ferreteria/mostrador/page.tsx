'use client';

import { useSearchParams } from 'next/navigation';

import { Mostrador } from '~/ferreteria/Mostrador';

/**
 * La pantalla insignia de la ferretería: armar la nota con el cliente enfrente.
 *
 * ── `?buscar=` · el enlace que daba 404 ────────────────────────────────────
 * La pantalla de Entradas ofrece «Buscar…» por cada renglón del proveedor que no
 * se pudo emparejar, y llevaba a `/ferreteria/catalogo`, que no existe. El sitio
 * donde se busca material por su descripción es éste, así que aquí se lee el
 * parámetro y la búsqueda llega escrita.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  const parametros = useSearchParams();
  const buscar = parametros.get('buscar');

  return buscar === null || buscar === '' ? <Mostrador /> : <Mostrador consultaInicial={buscar} />;
}
