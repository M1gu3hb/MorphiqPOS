'use client';

import { useEffect, useState } from 'react';

import { consultarPuente } from '~/cliente/api';

/** El grupo VIVO que encabeza una mesa: su unión y los números de las mesas que absorbió. */
export interface GrupoDeLaMesa {
  readonly unionId: string;
  readonly unidas: readonly number[];
}

/**
 * El grupo que encabeza una mesa (DP-9.6), para ofrecer «Separar mesas», decir «Unida con 2» y
 * preguntar qué hacer con el grupo ANTES de liberarla. `null` si no encabeza ninguno —o mientras
 * se lee—. `version` vuelve a leerlo.
 */
export function useUnionDeLaMesa(mesaId: string | null, version: number): GrupoDeLaMesa | null {
  const [leido, setLeido] = useState<{
    readonly mesaId: string;
    readonly grupo: GrupoDeLaMesa | null;
  } | null>(null);
  useEffect(() => {
    if (mesaId === null) return undefined;
    const control = new AbortController();
    Promise.all([
      consultarPuente<{ id?: string; cerrada_en?: string | null }>('UnionMesa', {
        filtro: { mesa_principal_id: mesaId },
        limite: 10,
        signal: control.signal,
      }),
      consultarPuente<{ numero?: number }>('Mesa', {
        filtro: { unida_a_mesa_id: mesaId },
        limite: 50,
        signal: control.signal,
      }),
    ])
      .then(([uniones, absorbidas]) => {
        const viva = uniones.find((u) => (u.cerrada_en ?? null) === null);
        const unidas = absorbidas
          .map((m) => m.numero)
          .filter((n): n is number => typeof n === 'number')
          .sort((a, b) => a - b);
        const grupo = viva?.id === undefined ? null : { unionId: viva.id, unidas };
        if (!control.signal.aborted) setLeido({ mesaId, grupo });
      })
      .catch(() => {
        // Sin leerlo no se ofrece «Separar» y se libera como siempre: si la mesa sí encabeza un
        // grupo, el servidor lo dice y entonces se pregunta.
        if (!control.signal.aborted) setLeido({ mesaId, grupo: null });
      });
    return () => {
      control.abort();
    };
  }, [mesaId, version]);
  return leido?.mesaId === mesaId ? leido.grupo : null;
}
