'use client';

import type { ReactElement, ReactNode } from 'react';

import { cn } from '../utilidades/cn';
import { Superficie } from './superficie';
import { TONOS_DE_FILA, type ColumnaDeTabla, type TonoDeFila } from './tabla';

/**
 * LA MISMA TABLA, EN TARJETAS · para la tableta y el teléfono.
 *
 * Una tabla de doce columnas en un teléfono no se arregla con scroll horizontal: se
 * arregla dejando de ser una tabla. Cada fila pasa a ser una tarjeta con su título,
 * su dato principal a la derecha y el resto debajo en pares etiqueta/valor.
 *
 * Es el MISMO modelo de columnas, así que una pantalla no mantiene dos listas de
 * campos que se desincronizan a la tercera semana.
 *
 * ── Y dice lo mismo que la tabla ──────────────────────────────────────────
 * La elegida, el tono de una fila, el viaje al panel, el nombre de la fila y el pie de
 * totales. Hasta que los tuvo, `TablaAdaptable` los perdía por debajo de su ancho: en el
 * teléfono la tarjeta elegida no se marcaba, una fila en peligro no se teñía y el total
 * del pie desaparecía, y cinco pantallas lo rodeaban cada una a su manera.
 */

/**
 * Cómo se reparten los pares etiqueta/valor dentro de la tarjeta. `adaptable` es una
 * columna en el teléfono y dos desde `sm`: lo que necesitan las tarjetas cuyas celdas son
 * CAMPOS —una nota de entrada—, que en media tarjeta no caben.
 */
export type ColumnasDeTarjeta = 'dos' | 'una' | 'adaptable';

const REPARTO: Readonly<Record<ColumnasDeTarjeta, string>> = {
  dos: 'grid-cols-2',
  una: 'grid-cols-1',
  adaptable: 'grid-cols-1 sm:grid-cols-2',
};

export interface ListaDeTarjetasProps<F> {
  readonly columnas: readonly ColumnaDeTabla<F>[];
  readonly filas: readonly F[];
  readonly claveDe: (fila: F) => string;
  /** La columna que manda: va grande, arriba. Normalmente el nombre o el total. */
  readonly principal: string;
  readonly alActivar?: ((clave: string) => void) | undefined;
  /** La tarjeta que se está mirando: se marca con forma, no sólo con color. */
  readonly activa?: string | undefined;
  readonly tonoDeFila?: ((fila: F) => TonoDeFila | undefined) | undefined;
  readonly viajeDeFila?: ((fila: F) => string | undefined) | undefined;
  readonly etiquetaDeFila?: ((fila: F) => string) | undefined;
  readonly columnasDeTarjeta?: ColumnasDeTarjeta | undefined;
  /** Los totales de la tabla, por `clave` de columna: van debajo de la lista. */
  readonly pie?: Readonly<Record<string, ReactNode>> | undefined;
  readonly vacio?: ReactNode;
  readonly className?: string | undefined;
}

export function ListaDeTarjetas<F>({
  columnas,
  filas,
  claveDe,
  principal,
  alActivar,
  activa,
  tonoDeFila,
  viajeDeFila,
  etiquetaDeFila,
  columnasDeTarjeta = 'dos',
  pie,
  vacio,
  className,
}: ListaDeTarjetasProps<F>): ReactElement {
  if (filas.length === 0 && vacio !== undefined) return <>{vacio}</>;

  const laPrincipal = columnas.find((c) => c.clave === principal);
  const lasDemas = columnas.filter((c) => c.clave !== principal);
  const totales = pie === undefined ? [] : columnas.filter((c) => pie[c.clave] !== undefined);

  return (
    <div className={cn('flex flex-col gap-(--espacio-3)', className)}>
      <ul className="flex flex-col gap-(--espacio-2)">
        {filas.map((fila) => {
          const clave = claveDe(fila);
          const esActiva = activa === clave;
          const tono = tonoDeFila?.(fila);
          const nombreDeViaje = viajeDeFila?.(fila);
          return (
            <li key={clave}>
              {/*
                Una tarjeta que se toca es un BOTÓN; una que sólo informa, no. Antes era
                siempre un `<button disabled>` —que además no deja seleccionar su texto— y
                una celda con su propio control dentro acababa siendo un botón en un botón.
              */}
              <Superficie
                como={alActivar === undefined ? 'div' : 'button'}
                interactiva={alActivar !== undefined}
                activa={esActiva}
                aria-current={esActiva ? 'true' : undefined}
                aria-label={
                  alActivar === undefined || etiquetaDeFila === undefined
                    ? undefined
                    : etiquetaDeFila(fila)
                }
                style={
                  nombreDeViaje === undefined ? undefined : { viewTransitionName: nombreDeViaje }
                }
                {...(alActivar === undefined
                  ? {}
                  : {
                      type: 'button',
                      onClick: () => {
                        alActivar(clave);
                      },
                    })}
                className={cn(
                  'flex w-full flex-col gap-(--espacio-2)',
                  tono === undefined ? '' : TONOS_DE_FILA[tono],
                )}
              >
                {laPrincipal === undefined ? null : (
                  <span className="text-base font-medium">{laPrincipal.celda(fila)}</span>
                )}
                <dl
                  className={cn(
                    'grid gap-x-(--espacio-4) gap-y-(--espacio-1)',
                    REPARTO[columnasDeTarjeta],
                  )}
                >
                  {lasDemas.map((columna) => (
                    <div
                      key={columna.clave}
                      className="flex items-baseline justify-between gap-(--espacio-2)"
                    >
                      <dt className="text-xs text-texto-sutil">{columna.titulo}</dt>
                      <dd
                        className={cn(
                          'text-sm',
                          columna.numerica === true ? 'font-numeros tabular-nums' : '',
                        )}
                      >
                        {columna.celda(fila)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Superficie>
            </li>
          );
        })}
      </ul>
      {totales.length === 0 ? null : (
        <Superficie
          como="dl"
          nivel={0}
          relleno={3}
          className="flex flex-wrap justify-end gap-x-(--espacio-6) gap-y-(--espacio-1)"
        >
          {totales.map((columna) => (
            <div key={columna.clave} className="flex items-baseline gap-(--espacio-2)">
              <dt className="text-xs text-texto-sutil">{columna.titulo}</dt>
              <dd className="font-medium">{pie?.[columna.clave]}</dd>
            </div>
          ))}
        </Superficie>
      )}
    </div>
  );
}
