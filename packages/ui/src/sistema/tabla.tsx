'use client';

import type { ReactElement, ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { cn } from '../utilidades/cn';

/**
 * TABLA DENSA · lo que más hay en un punto de venta.
 *
 * ── Las cinco cosas que una tabla de POS tiene que hacer bien ─────────────
 *   1 · **Cabecera fija.** Una tabla de 1 800 claves sin cabecera fija obliga a
 *       subir para recordar qué columna se está mirando.
 *   2 · **Los números a la derecha, en cifras tabulares.** Es lo único que permite
 *       comparar una columna de precios de un vistazo.
 *   3 · **Scroll horizontal PROPIO.** Si la tabla empuja el ancho de la página,
 *       mover la tabla mueve la pantalla entera y se pierde el menú.
 *   4 · **Fila activa y selección múltiple**, con teclado.
 *   5 · **Ordenación**, que diga por qué columna y en qué sentido sin adivinar.
 *
 * ── Lo que esto NO hace, a propósito ──────────────────────────────────────
 * No pagina, no filtra y no pide datos. Recibe las filas ya resueltas: quién las
 * trae y cuántas es decisión de la pantalla, y meterlo aquí obligaría a que todas
 * las pantallas pidieran igual.
 */

export interface ColumnaDeTabla<F> {
  readonly clave: string;
  readonly titulo: string;
  /** Cómo se pinta la celda. Recibe la fila entera, no un valor suelto. */
  readonly celda: (fila: F) => ReactNode;
  /**
   * NUMÉRICA: a la derecha y en cifras tabulares.
   *
   * No se adivina por el tipo del dato: una clave de barras es un número y se lee a
   * la izquierda, como el texto que es para quien la busca.
   */
  readonly numerica?: boolean;
  /** Con qué valor se ordena. Sin esto, la columna no se puede ordenar. */
  readonly orden?: (fila: F) => string | number;
  /** Se esconde por debajo de este ancho. Una tabla de 12 columnas no cabe en un teléfono. */
  readonly desde?: 'sm' | 'md' | 'lg';
}

const DESDE = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
} as const;

export interface TablaProps<F> {
  readonly columnas: readonly ColumnaDeTabla<F>[];
  readonly filas: readonly F[];
  readonly claveDe: (fila: F) => string;
  /** La fila que se está mirando. Se marca, y se lleva el foco al navegar. */
  readonly activa?: string;
  readonly alActivar?: (clave: string) => void;
  /** Si viene, aparece la columna de selección múltiple. */
  readonly seleccion?: {
    readonly elegidas: ReadonlySet<string>;
    readonly alCambiar: (elegidas: ReadonlySet<string>) => void;
  };
  /** Qué se enseña cuando no hay ni una fila. */
  readonly vacio?: ReactNode;
  /** Alto máximo del cuerpo. Sin esto, la cabecera fija no tiene contra qué fijarse. */
  readonly alto?: string;
  readonly className?: string;
}

export function Tabla<F>({
  columnas,
  filas,
  claveDe,
  activa,
  alActivar,
  seleccion,
  vacio,
  alto = 'max-h-[60vh]',
  className,
}: TablaProps<F>): ReactElement {
  const [ordenPor, setOrdenPor] = useState<string | null>(null);
  const [ascendente, setAscendente] = useState(true);

  const ordenadas = useMemo(() => {
    if (ordenPor === null) return filas;
    const columna = columnas.find((c) => c.clave === ordenPor);
    if (columna?.orden === undefined) return filas;
    const sacar = columna.orden;
    // `toSorted` y no `sort`: ordenar in situ muta la lista de quien llama, y esa
    // lista puede ser el estado de la pantalla.
    return [...filas].toSorted((a, b) => {
      const va = sacar(a);
      const vb = sacar(b);
      const signo =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'es-MX');
      return ascendente ? signo : -signo;
    });
  }, [filas, columnas, ordenPor, ascendente]);

  function alternarOrden(clave: string): void {
    if (ordenPor === clave) {
      setAscendente((previo) => !previo);
      return;
    }
    setOrdenPor(clave);
    setAscendente(true);
  }

  const todasElegidas =
    seleccion !== undefined &&
    filas.length > 0 &&
    filas.every((f) => seleccion.elegidas.has(claveDe(f)));

  if (filas.length === 0 && vacio !== undefined) return <>{vacio}</>;

  return (
    // EL SCROLL ES SUYO, no de la página: `overflow-auto` aquí y no en un ancestro.
    <div className={cn('w-full overflow-auto rounded-lg border border-border', alto, className)}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {seleccion === undefined ? null : (
              <th scope="col" className="w-10 p-0">
                <label className="flex min-h-(--area-tactil-minima) cursor-pointer items-center justify-center px-(--espacio-3)">
                  <input
                    type="checkbox"
                    aria-label={todasElegidas ? 'Quitar la selección' : 'Seleccionar todo'}
                    checked={todasElegidas}
                    onChange={() => {
                      seleccion.alCambiar(
                        todasElegidas ? new Set() : new Set(filas.map((f) => claveDe(f))),
                      );
                    }}
                    className="size-4 accent-primary"
                  />
                </label>
              </th>
            )}
            {columnas.map((columna) => {
              const ordenable = columna.orden !== undefined;
              const esLaOrdenada = ordenPor === columna.clave;
              return (
                <th
                  key={columna.clave}
                  scope="col"
                  // `aria-sort` es lo que hace que un lector de pantalla diga por qué
                  // columna está ordenada. Sin él, el triángulo no existe para nadie
                  // que no lo vea.
                  aria-sort={esLaOrdenada ? (ascendente ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'text-xs font-medium tracking-wide text-muted-foreground uppercase',
                    // Ordenable: el relleno pasa AL BOTON, para que se pueda tocar
                    // toda la cabecera y no solo los 16 px de alto de su texto.
                    ordenable ? 'p-0' : 'px-(--espacio-3) py-(--espacio-2)',
                    columna.numerica === true ? 'text-right' : 'text-left',
                    columna.desde === undefined ? '' : DESDE[columna.desde],
                  )}
                >
                  {ordenable ? (
                    <button
                      type="button"
                      onClick={() => {
                        alternarOrden(columna.clave);
                      }}
                      className={cn(
                        'flex min-h-(--area-tactil-minima) w-full items-center gap-1 px-(--espacio-3) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        columna.numerica === true ? 'justify-end' : 'justify-start',
                      )}
                    >
                      {columna.titulo}
                      <span aria-hidden="true" className={esLaOrdenada ? '' : 'opacity-30'}>
                        {esLaOrdenada && !ascendente ? '▾' : '▴'}
                      </span>
                    </button>
                  ) : (
                    columna.titulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((fila) => {
            const clave = claveDe(fila);
            const esActiva = activa === clave;
            const elegida = seleccion?.elegidas.has(clave) === true;
            return (
              <tr
                key={clave}
                data-activa={esActiva ? '' : undefined}
                aria-selected={seleccion === undefined ? undefined : elegida}
                tabIndex={alActivar === undefined ? undefined : 0}
                onClick={
                  alActivar === undefined
                    ? undefined
                    : () => {
                        alActivar(clave);
                      }
                }
                onKeyDown={
                  alActivar === undefined
                    ? undefined
                    : (evento) => {
                        // Enter y espacio: la fila se comporta como lo que es, un
                        // control. Sin esto, una tabla sólo se opera con ratón.
                        if (evento.key !== 'Enter' && evento.key !== ' ') return;
                        evento.preventDefault();
                        alActivar(clave);
                      }
                }
                className={cn(
                  'border-t border-border transition-colors duration-(--duracion-rapida)',
                  alActivar === undefined
                    ? ''
                    : 'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  esActiva ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60',
                )}
              >
                {seleccion === undefined ? null : (
                  /**
                   * LA CELDA ENTERA MARCA, no los 16 px de la casilla.
                   *
                   * Una casilla nativa mide 16x16 y no se le puede poner un area de
                   * toque por dentro: es un elemento reemplazado, no admite `::after`
                   * ni padding. Asi que lo que crece es la ZONA, con un `<label>` que
                   * llena la celda: la altura de la fila por el ancho de la columna,
                   * y ni un pixel fuera —nada se monta sobre la fila de arriba—.
                   *
                   * El `stopPropagation` va en el LABEL y no solo en la casilla: el
                   * clic del label burbujea por su cuenta hasta la fila, asi que sin
                   * el, marcar abriria la ficha. Ya pasaba con la casilla suelta.
                   */
                  <td className="p-0">
                    <label
                      className="flex min-h-(--area-tactil-minima) cursor-pointer items-center justify-center px-(--espacio-3)"
                      onClick={(evento) => {
                        evento.stopPropagation();
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${clave}`}
                        checked={elegida}
                        onClick={(evento) => {
                          // Marcar no es activar: sin esto, marcar abre la fila.
                          evento.stopPropagation();
                        }}
                        onChange={() => {
                          const siguiente = new Set(seleccion.elegidas);
                          if (elegida) siguiente.delete(clave);
                          else siguiente.add(clave);
                          seleccion.alCambiar(siguiente);
                        }}
                        className="size-4 accent-primary"
                      />
                    </label>
                  </td>
                )}
                {columnas.map((columna) => (
                  <td
                    key={columna.clave}
                    className={cn(
                      'px-(--espacio-3) py-(--espacio-2)',
                      columna.numerica === true ? 'text-right font-numeros tabular-nums' : '',
                      columna.desde === undefined ? '' : DESDE[columna.desde],
                    )}
                  >
                    {columna.celda(fila)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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
            <button
              type="button"
              disabled={alActivar === undefined}
              onClick={
                alActivar === undefined
                  ? undefined
                  : () => {
                      alActivar(clave);
                    }
              }
              className={cn(
                'flex w-full flex-col gap-(--espacio-2) rounded-lg border border-border bg-card p-(--espacio-4) text-left shadow-1',
                'transition-[box-shadow,transform] duration-(--duracion-rapida)',
                alActivar === undefined
                  ? 'cursor-default'
                  : 'hover:shadow-2 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              )}
            >
              {laPrincipal === undefined ? null : (
                <span className="text-base font-medium">{laPrincipal.celda(fila)}</span>
              )}
              <dl className="grid grid-cols-2 gap-x-(--espacio-4) gap-y-(--espacio-1)">
                {lasDemas.map((columna) => (
                  <div key={columna.clave} className="flex items-baseline justify-between gap-2">
                    <dt className="text-xs text-muted-foreground">{columna.titulo}</dt>
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
            </button>
          </li>
        );
      })}
    </ul>
  );
}
