'use client';

import type { ReactElement } from 'react';
import { useSyncExternalStore } from 'react';

import { ListaDeTarjetas, type ColumnasDeTarjeta } from './lista-de-tarjetas';
import { Tabla, type TablaProps } from './tabla';

/**
 * LA TABLA QUE SE VUELVE TARJETAS · el mismo modelo de columnas, dos formas.
 *
 * El dispositivo principal decide el layout (`04-SISTEMA-DE-DISENO §2 eje E`): en la
 * PC del mostrador los resultados son una tabla densa que se compara de un vistazo;
 * en la tableta del pasillo son tarjetas de dos renglones con la ubicación grande,
 * porque se está caminando hacia ella. Pintar las dos y esconder una con CSS deja la
 * lista DOS veces en la página —dos filas con el mismo nombre para el lector de
 * pantalla, dos botones iguales para una prueba—, así que aquí se pinta una sola.
 *
 * Hasta saber el ancho —en el servidor, y en el primer pintado— se pinta la tabla:
 * las pantallas que usan esto leen sus datos después de montar, así que cuando las
 * filas llegan el ancho ya se sabe y nada salta.
 *
 * Y a las tarjetas les pasa lo que la tabla dice ADEMÁS de sus celdas: la fila elegida,
 * el tono, el viaje al panel, el nombre de la fila y el pie. Sin eso, en el teléfono la
 * tarjeta elegida no se marcaba y el total desaparecía.
 */

const ANCHOS = { md: 768, lg: 1024, xl: 1280 } as const;

function useAlMenos(desde: keyof typeof ANCHOS): boolean {
  const consulta = `(min-width: ${String(ANCHOS[desde])}px)`;
  return useSyncExternalStore(
    (avisar) => {
      const medio = window.matchMedia(consulta);
      medio.addEventListener('change', avisar);
      return () => {
        medio.removeEventListener('change', avisar);
      };
    },
    () => window.matchMedia(consulta).matches,
    () => true,
  );
}

export interface TablaAdaptableProps<F> extends TablaProps<F> {
  /** La columna que manda en la tarjeta: va grande, arriba. */
  readonly principal: string;
  /** Desde qué ancho es tabla. Por debajo, tarjetas. */
  readonly desde?: keyof typeof ANCHOS | undefined;
  /** Cómo se reparten los pares dentro de cada tarjeta. */
  readonly columnasDeTarjeta?: ColumnasDeTarjeta | undefined;
}

export function TablaAdaptable<F>({
  principal,
  desde = 'xl',
  columnasDeTarjeta,
  ...tabla
}: TablaAdaptableProps<F>): ReactElement {
  const ancha = useAlMenos(desde);
  if (ancha) return <Tabla {...tabla} />;
  return (
    <ListaDeTarjetas
      columnas={tabla.columnas}
      filas={tabla.filas}
      claveDe={tabla.claveDe}
      principal={principal}
      alActivar={tabla.alActivar}
      activa={tabla.activa}
      tonoDeFila={tabla.tonoDeFila}
      viajeDeFila={tabla.viajeDeFila}
      etiquetaDeFila={tabla.etiquetaDeFila}
      columnasDeTarjeta={columnasDeTarjeta}
      pie={tabla.pie}
      vacio={tabla.vacio}
      className={tabla.className}
    />
  );
}
