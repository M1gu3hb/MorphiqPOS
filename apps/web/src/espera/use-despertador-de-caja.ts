'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { cambiosDeLaLista } from './cambios-de-la-lista';
import { despertarLaPantalla } from './despertador';

/** La lectura de la Caja heredada: las ventas en «cuenta pedida», cada 2 s (`Caja.jsx`). */
const CLAVE_DE_LAS_PEDIDAS = 'ventas_pendientes_caja';

/**
 * LO QUE DESPIERTA A LA CAJA (DP-11.2): una cuenta pedida que aparece (la pidió el mesero o el
 * comensal) o una que se va (la cobró otra terminal: el pago que entra). No hace peticiones
 * propias: escucha la lectura que la Caja ya hace cada dos segundos, debajo de la capa, y compara
 * sus ids. Lo que ya estaba al abrir no despierta (primera lectura = referencia).
 */
export function useDespertadorDeCaja(activo: boolean): void {
  const cliente = useQueryClient();
  useEffect(() => {
    if (!activo) return undefined;
    let vistas: ReadonlySet<string> | null = null;
    return cliente.getQueryCache().subscribe((evento) => {
      if (evento.type !== 'updated' || evento.action.type !== 'success') return;
      // La caché tipa sus consultas con `any`; aquí sólo se mira la primera pieza de la llave.
      const llave = evento.query.queryKey as readonly unknown[];
      if (llave[0] !== CLAVE_DE_LAS_PEDIDAS) return;
      const filas: unknown = evento.query.state.data;
      const ids = Array.isArray(filas)
        ? filas.flatMap((fila: unknown) =>
            typeof fila === 'object' && fila !== null && 'id' in fila ? [String(fila.id)] : [],
          )
        : [];
      const { nuevas, idas, vistas: ahora } = cambiosDeLaLista(vistas, ids);
      vistas = ahora;
      if (nuevas.length > 0) despertarLaPantalla('cuenta');
      else if (idas.length > 0) despertarLaPantalla('pago');
    });
  }, [activo, cliente]);
}
