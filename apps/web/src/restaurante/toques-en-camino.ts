import { useCallback, useRef, useState } from 'react';

/**
 * LOS TOQUES DE LA COCINA QUE VAN EN CAMINO (DP-7).
 *
 * La pantalla de cocina pinta cada toque antes de que el servidor conteste: un toque que tarda
 * medio segundo en verse se repite. Pero relee su lista al contestar cada toque y cada dos
 * segundos, y una lectura que salió antes de que OTRO toque llegara a la base lo trae en su
 * estado viejo. Esa lectura pisaba lo pintado: la comanda regresaba a «Nuevos» un instante y el
 * cocinero tocaba la equivocada (lo vio la CI: el segundo «Listo» cayó otra vez sobre la primera
 * comanda y la de la barra se quedó en el fuego).
 *
 * Por eso lo pintado no se escribe en la lectura —que la siguiente lectura borra— sino aparte:
 * mientras un toque va en camino, su comanda se pinta como la dejó el toque. Se suelta cuando
 * contesta y ya se releyó después, y sólo si nadie la tocó otra vez mientras tanto.
 */

export interface Toque<T> {
  /** Cuál toque fue: el de una comanda que se toca dos veces es el segundo. */
  readonly numero: number;
  readonly parche: Partial<T>;
}

export type ToquesEnCamino<T> = ReadonlyMap<string, Toque<T>>;

/** Los toques con uno más. Si la comanda ya tenía uno, se juntan y gana el nuevo. */
export function conToque<T>(
  toques: ToquesEnCamino<T>,
  id: string,
  numero: number,
  parche: Partial<T>,
): ToquesEnCamino<T> {
  const previo = toques.get(id)?.parche;
  return new Map(toques).set(id, { numero, parche: { ...previo, ...parche } });
}

/** Los toques sin el `numero` de esa comanda. Si la volvieron a tocar, el nuevo se queda. */
export function sinToque<T>(
  toques: ToquesEnCamino<T>,
  id: string,
  numero: number,
): ToquesEnCamino<T> {
  if (toques.get(id)?.numero !== numero) return toques;
  const siguientes = new Map(toques);
  siguientes.delete(id);
  return siguientes;
}

/** `Array.isArray` sobre una lista de sólo lectura la deja en `any[]`: esto la deja en la suya. */
function esLista<T>(filas: readonly T[] | null | undefined): filas is readonly T[] {
  return Array.isArray(filas);
}

/** Lo que se leyó, con cada toque en camino encima. Lo que no es una lista es ninguna comanda. */
export function conLosToques<T extends { readonly id?: string | null }>(
  filas: readonly T[] | null | undefined,
  toques: ToquesEnCamino<T>,
): readonly T[] {
  if (!esLista(filas)) return [];
  if (toques.size === 0) return filas;
  return filas.map((fila) => {
    const toque = fila.id == null ? undefined : toques.get(fila.id);
    return toque === undefined ? fila : { ...fila, ...toque.parche };
  });
}

export interface ToquesDeLaPantalla<T> {
  readonly toques: ToquesEnCamino<T>;
  /** Pinta el toque y devuelve su número, para soltarlo después. */
  readonly poner: (id: string, parche: Partial<T>) => number;
  readonly soltar: (id: string, numero: number) => void;
}

/** Los toques en camino de una pantalla. */
export function useToquesEnCamino<T>(): ToquesDeLaPantalla<T> {
  const [toques, setToques] = useState<ToquesEnCamino<T>>(() => new Map());
  const contador = useRef(0);
  const poner = useCallback((id: string, parche: Partial<T>): number => {
    contador.current += 1;
    const numero = contador.current;
    setToques((previos) => conToque(previos, id, numero, parche));
    return numero;
  }, []);
  const soltar = useCallback((id: string, numero: number): void => {
    setToques((previos) => sinToque(previos, id, numero));
  }, []);
  return { toques, poner, soltar };
}
