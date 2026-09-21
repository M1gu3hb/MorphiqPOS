'use client';

import { useSearchParams } from 'next/navigation';

import { OpcionesDeLaBebida } from '~/cafeteria/OpcionesDeLaBebida';

/**
 * Las opciones de la bebida —leche, temperatura, shots— antes de mandarla a barra.
 *
 * ── AGREGAR CONTESTABA 400 SIEMPRE, y el rastreador lo encontró ────────────
 * La página montaba `<OpcionesDeLaBebida />` sin bebida, y el comando
 * `cafeteria.agregar_linea` pide `productoId: z.uuid()`: el componente mandaba
 * `null` y cada toque de AGREGAR moría con `ENTRADA_INVALIDA`, después de elegir
 * la leche, el tamaño y el dulzor. Desde el menú —el único sitio desde donde se
 * llega a esta pantalla— era el 100% de las veces.
 *
 * La bebida viaja en `?producto=`, y sin ella el componente apaga AGREGAR y dice
 * qué falta en vez de fingir que se puede.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  const parametros = useSearchParams();
  const producto = parametros.get('producto');

  return producto === null || producto === '' ? (
    <OpcionesDeLaBebida />
  ) : (
    <OpcionesDeLaBebida productoId={producto} />
  );
}
