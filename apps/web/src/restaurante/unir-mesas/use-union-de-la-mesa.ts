'use client';

import { useEffect, useState } from 'react';

import { consultarPuente } from '~/cliente/api';

/** El grupo VIVO que encabeza una mesa: su unión. */
export interface GrupoDeLaMesa {
  readonly unionId: string;
}

/**
 * El grupo que encabeza una mesa (D-2, DP-10.3), para ofrecer «Separar mesas» en su pantalla.
 * `null` si no encabeza ninguno —o mientras se lee—. `version` vuelve a leerlo. En la fase B
 * (DP-9.6) esto también dice qué mesas absorbió.
 */
export function useUnionDeLaMesa(mesaId: string | null, version: number): GrupoDeLaMesa | null {
  const [leido, setLeido] = useState<{
    readonly mesaId: string;
    readonly grupo: GrupoDeLaMesa | null;
  } | null>(null);
  useEffect(() => {
    if (mesaId === null) return undefined;
    const control = new AbortController();
    consultarPuente<{ id?: string; cerrada_en?: string | null }>('UnionMesa', {
      filtro: { mesa_principal_id: mesaId },
      limite: 10,
      signal: control.signal,
    })
      .then((uniones) => {
        const viva = uniones.find((u) => (u.cerrada_en ?? null) === null);
        const grupo = viva?.id === undefined ? null : { unionId: viva.id };
        if (!control.signal.aborted) setLeido({ mesaId, grupo });
      })
      .catch(() => {
        // Sin leerlo no se ofrece «Separar»: la mesa sigue funcionando como siempre.
        if (!control.signal.aborted) setLeido({ mesaId, grupo: null });
      });
    return () => {
      control.abort();
    };
  }, [mesaId, version]);
  return leido?.mesaId === mesaId ? leido.grupo : null;
}
