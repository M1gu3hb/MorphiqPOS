'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
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
  readonly activa?: string | undefined;
  readonly alActivar?: ((clave: string) => void) | undefined;
  /** Si viene, aparece la columna de selección múltiple. */
  readonly seleccion?: {
    readonly elegidas: ReadonlySet<string>;
    readonly alCambiar: (elegidas: ReadonlySet<string>) => void;
  };
  /** Qué se enseña cuando no hay ni una fila. */
  readonly vacio?: ReactNode;
  /** Alto máximo del cuerpo. Sin esto, la cabecera fija no tiene contra qué fijarse. */
  readonly alto?: string | undefined;
  /** El nombre de la tabla para un lector de pantalla: una tabla sin nombre es «tabla». */
  readonly etiqueta?: string | undefined;
  /**
   * EL PIE: los totales, cada uno debajo de SU columna —por `clave`—, pegado abajo
   * como la cabecera arriba. Un total que no está bajo su columna obliga a buscarlo.
   */
  readonly pie?: Readonly<Record<string, ReactNode>> | undefined;
  /**
   * El tono de una fila: lo que está bajo mínimo, lo vencido, lo que ya se entregó. Es
   * un fondo, y NUNCA va solo: la celda dice con texto o con icono por qué.
   */
  readonly tonoDeFila?: ((fila: F) => TonoDeFila | undefined) | undefined;
  /** El nombre de viaje de la fila, para la transición que la convierte en panel. */
  readonly viajeDeFila?: ((fila: F) => string | undefined) | undefined;
  /**
   * El NOMBRE de una fila que se toca, para un lector de pantalla: «Cobrar la mesa 4,
   * $540.00». Sin él, la acción principal de una caja es una fila sin nombre.
   */
  readonly etiquetaDeFila?: ((fila: F) => string) | undefined;
  readonly className?: string | undefined;
}

export type TonoDeFila = 'advertencia' | 'peligro' | 'exito' | 'tenue';

export const TONOS_DE_FILA: Readonly<Record<TonoDeFila, string>> = {
  advertencia: 'bg-advertencia/10',
  peligro: 'bg-peligro/5',
  exito: 'bg-exito/5',
  tenue: 'text-texto-sutil',
};

/**
 * ¿El clic vino de un control DENTRO de la fila? Un botón de «quitar» o un campo de
 * cantidad en una celda no activan la fila: sin esto, tocar «−» abría la ficha.
 */
function desdeUnControl(objetivo: EventTarget, fila: HTMLElement): boolean {
  if (!(objetivo instanceof Element)) return false;
  const control = objetivo.closest('button, a, input, select, textarea, label, [role="button"]');
  return control !== null && control !== fila && fila.contains(control);
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
  etiqueta,
  pie,
  tonoDeFila,
  viajeDeFila,
  etiquetaDeFila,
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
    <div className={cn('w-full overflow-auto rounded-lg border border-borde', alto, className)}>
      <table className="w-full border-collapse text-sm" aria-label={etiqueta}>
        <thead className="sticky top-0 z-10 bg-fondo-sutil">
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
                    className="size-4 accent-primario"
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
                    'text-xs font-medium tracking-wide text-texto-sutil uppercase',
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
                        'flex min-h-(--area-tactil-minima) w-full items-center gap-1 px-(--espacio-3) hover:text-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none',
                        columna.numerica === true ? 'justify-end' : 'justify-start',
                      )}
                    >
                      {columna.titulo}
                      {/*
                       * La marca de «se puede ordenar» iba al 30 % de opacidad y el rastreador
                       * la midió en 1.64:1: una pista que no se ve no dice nada. Ahora es un
                       * icono en el color de la cabecera, a opacidad plena, y la columna
                       * ORDENADA cambia de forma —flecha arriba o abajo— y de color, no sólo
                       * de intensidad.
                       */}
                      {esLaOrdenada && ascendente ? (
                        <ArrowUp aria-hidden="true" className="size-3.5 shrink-0 text-texto" />
                      ) : esLaOrdenada ? (
                        <ArrowDown aria-hidden="true" className="size-3.5 shrink-0 text-texto" />
                      ) : (
                        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0" />
                      )}
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
            const tono = tonoDeFila?.(fila);
            const nombreDeViaje = viajeDeFila?.(fila);
            return (
              <tr
                key={clave}
                style={
                  nombreDeViaje === undefined ? undefined : { viewTransitionName: nombreDeViaje }
                }
                data-activa={esActiva ? '' : undefined}
                // La elegida lo dice sin color: `aria-current` para quien no ve, y
                // seminegritas para quien no distingue el tinte.
                aria-current={esActiva ? 'true' : undefined}
                aria-label={
                  alActivar === undefined || etiquetaDeFila === undefined
                    ? undefined
                    : etiquetaDeFila(fila)
                }
                aria-selected={seleccion === undefined ? undefined : elegida}
                tabIndex={alActivar === undefined ? undefined : 0}
                onClick={
                  alActivar === undefined
                    ? undefined
                    : (evento) => {
                        if (desdeUnControl(evento.target, evento.currentTarget)) return;
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
                        if (desdeUnControl(evento.target, evento.currentTarget)) return;
                        evento.preventDefault();
                        alActivar(clave);
                      }
                }
                className={cn(
                  'border-t border-borde transition-colors duration-(--duracion-rapida)',
                  alActivar === undefined
                    ? ''
                    : 'cursor-pointer focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none',
                  tono === undefined ? '' : TONOS_DE_FILA[tono],
                  esActiva
                    ? 'bg-acento-suave font-semibold text-acento-suave-texto'
                    : 'hover:bg-fondo-sutil/60',
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
                        className="size-4 accent-primario"
                      />
                    </label>
                  </td>
                )}
                {columnas.map((columna) => (
                  <td
                    key={columna.clave}
                    className={cn(
                      'px-(--espacio-3) py-(--espacio-2)',
                      // Una fila que se TOCA mide al menos el área táctil: en una tabla
                      // densa de `text-sm` medía 37 px. El alto de una celda es su mínimo.
                      alActivar === undefined ? '' : 'h-(--area-tactil-minima)',
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
        {pie === undefined ? null : (
          <tfoot className="sticky bottom-0 z-10 border-t-2 border-borde bg-fondo-sutil font-medium">
            <tr>
              {seleccion === undefined ? null : <td />}
              {columnas.map((columna) => (
                <td
                  key={columna.clave}
                  className={cn(
                    'px-(--espacio-3) py-(--espacio-2)',
                    columna.numerica === true ? 'text-right font-numeros tabular-nums' : '',
                    columna.desde === undefined ? '' : DESDE[columna.desde],
                  )}
                >
                  {pie[columna.clave]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
