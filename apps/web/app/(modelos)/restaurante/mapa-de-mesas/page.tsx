'use client';

import { useRouter } from 'next/navigation';

import { MapaDeMesas } from '~/restaurante/MapaDeMesas';

/**
 * La pantalla de inicio del mesero.
 *
 * ── EL MAPA NO ABRÍA MESAS, Y ES EL CORAZÓN DEL MODELO ─────────────────────
 * Esta página montaba `<MapaDeMesas />` sin `onAbrirMesa`. El componente acepta
 * el callback y lo dispara al tocar una mesa, así que el mapa PINTABA las doce
 * mesas con sus ocho estados y tocarlas **no hacía nada**: la pantalla donde un
 * restaurante empieza todas sus ventas era una imagen.
 *
 * Ahora tocar una mesa lleva a la mesa —`/restaurante/mesa-activa?mesa=<id>`—,
 * que es donde el mesero levanta el pedido. Si la mesa está libre, esa pantalla
 * pregunta para cuántas personas y la abre; si ya está abierta, entra directo al
 * pedido. La decisión de cuántas personas vive ahí y no aquí a propósito: es el
 * primer dato de la comanda, no una propiedad del plano.
 *
 * ── Por qué esta página es `'use client'` y las demás no ───────────────────
 * Porque `useRouter` sólo existe en el cliente, y navegar con el enrutador —en
 * vez de un `<a>` o un `location.assign`— conserva el estado del árbol: el mesero
 * que entra y sale de tres mesas no espera una recarga completa cada vez. El
 * componente ya era de cliente; lo que cambia es quién le pasa el callback.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  const enrutador = useRouter();

  return (
    <MapaDeMesas
      onAbrirMesa={(mesaId) => {
        enrutador.push(`/restaurante/mesa-activa?mesa=${encodeURIComponent(mesaId)}`);
      }}
    />
  );
}
