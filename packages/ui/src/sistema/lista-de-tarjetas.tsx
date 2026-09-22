'use client';

import type { ReactElement, ReactNode } from 'react';

import { cn } from '../utilidades/cn';
import { Superficie } from './superficie';
import type { ColumnaDeTabla } from './tabla';

/**
 * LA MISMA TABLA, EN TARJETAS · para la tableta y el teléfono.
 *
 * Una tabla de doce columnas en un teléfono no se arregla con scroll horizontal: se
 * arregla dejando de ser una tabla. Cada fila pasa a ser una tarjeta con su título,
 * su dato principal a la derecha y el resto debajo en pares etiqueta/valor.
 *
 * Es el MISMO modelo de columnas, así que una pantalla no mantiene dos listas de
 * campos que se desincronizan a la tercera semana.
 */
export function ListaDeTarjetas<F>({
  columnas,
  filas,
  claveDe,
  principal,
  alActivar,
  vacio,
  className,
}: {
  readonly columnas: readonly ColumnaDeTabla<F>[];
  readonly filas: readonly F[];
  readonly claveDe: (fila: F) => string;
  /** La columna que manda: va grande, arriba. Normalmente el nombre o el total. */
  readonly principal: string;
  readonly alActivar?: (clave: string) => void;
  readonly vacio?: ReactNode;
  readonly className?: string;
}): ReactElement {
  if (filas.length === 0 && vacio !== undefined) return <>{vacio}</>;

  const laPrincipal = columnas.find((c) => c.clave === principal);
  const lasDemas = columnas.filter((c) => c.clave !== principal);

  return (
    <ul className={cn('flex flex-col gap-(--espacio-2)', className)}>
      {filas.map((fila) => {
        const clave = claveDe(fila);
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
              {...(alActivar === undefined
                ? {}
                : {
                    type: 'button',
                    onClick: () => {
                      alActivar(clave);
                    },
                  })}
              className="flex w-full flex-col gap-(--espacio-2)"
            >
              {laPrincipal === undefined ? null : (
                <span className="text-base font-medium">{laPrincipal.celda(fila)}</span>
              )}
              <dl className="grid grid-cols-2 gap-x-(--espacio-4) gap-y-(--espacio-1)">
                {lasDemas.map((columna) => (
                  <div key={columna.clave} className="flex items-baseline justify-between gap-2">
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
  );
}
