'use client';

import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';

import { cn } from '../utilidades/cn';

/**
 * NAVEGACIÓN · dónde estoy y a dónde puedo ir.
 *
 * ── Tres formas para tres dispositivos, no una que se encoge ──────────────
 * El eje E del sistema de diseño dice que el dispositivo principal cambia por giro:
 * la tableta del mesero, la PC con lector de la tiendita, el teléfono del técnico en
 * la bahía. Una barra lateral que se encoge hasta caber en un teléfono no es
 * navegación de teléfono: es una barra lateral incómoda.
 *
 *   · `BarraLateral`   · PC y tableta. Grupos, colapsable a iconos.
 *   · `AbanicoInferior`· teléfono. Al alcance del pulgar, cinco destinos como mucho.
 *   · `Migas`          · donde hay profundidad, en cualquiera de los tres.
 */

export interface DestinoDeNavegacion {
  readonly clave: string;
  readonly rotulo: string;
  readonly icono: ReactNode;
  /** Un número que pide atención: pedidos en cocina, mesas por cobrar. */
  readonly insignia?: number;
}

export interface GrupoDeNavegacion {
  readonly titulo: string;
  readonly destinos: readonly DestinoDeNavegacion[];
}

/**
 * BARRA LATERAL · agrupada, colapsable, y que dice dónde estás.
 *
 * ── El detalle que decide si se ve hecha ──────────────────────────────────
 * El elemento activo no se marca sólo con color: lleva además una **barra vertical
 * en su borde**. Es lo que hace que se localice de reojo sin leer, y lo que sostiene
 * la información cuando alguien no distingue el azul del gris.
 *
 * Colapsada, cada destino conserva su `aria-label` y enseña su rótulo en un `title`.
 * Una barra de iconos sin nombres es un examen de memoria.
 */
export function BarraLateral({
  grupos,
  activo,
  alIr,
  encabezado,
  pie,
  colapsadaInicial = false,
  className,
}: {
  readonly grupos: readonly GrupoDeNavegacion[];
  readonly activo: string;
  readonly alIr: (clave: string) => void;
  readonly encabezado?: ReactNode;
  readonly pie?: ReactNode;
  readonly colapsadaInicial?: boolean;
  readonly className?: string;
}): ReactElement {
  const [colapsada, setColapsada] = useState(colapsadaInicial);

  return (
    <nav
      aria-label="Navegación principal"
      data-colapsada={colapsada ? '' : undefined}
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        'transition-[width] duration-(--duracion-normal) ease-[cubic-bezier(0.23,1,0.32,1)]',
        colapsada ? 'w-16' : 'w-60',
        className,
      )}
    >
      {encabezado === undefined ? null : (
        <div className="flex items-center gap-(--espacio-3) p-(--espacio-4)">{encabezado}</div>
      )}

      <div className="flex-1 overflow-y-auto px-(--espacio-2)">
        {grupos.map((grupo) => (
          <div key={grupo.titulo} className="mb-(--espacio-4)">
            {/* El título del grupo desaparece al colapsar, pero el grupo sigue
                separado por el espacio: la estructura no se pierde. */}
            {colapsada ? (
              <div className="my-(--espacio-2) border-t border-sidebar-border" />
            ) : (
              <p className="px-(--espacio-2) py-(--espacio-1) text-xs font-medium tracking-wide text-sidebar-foreground/60 uppercase">
                {grupo.titulo}
              </p>
            )}
            <ul className="flex flex-col gap-px">
              {grupo.destinos.map((destino) => {
                const esActivo = destino.clave === activo;
                return (
                  <li key={destino.clave}>
                    <button
                      type="button"
                      onClick={() => {
                        alIr(destino.clave);
                      }}
                      aria-current={esActivo ? 'page' : undefined}
                      title={colapsada ? destino.rotulo : undefined}
                      aria-label={colapsada ? destino.rotulo : undefined}
                      className={cn(
                        'relative flex w-full items-center gap-(--espacio-3) rounded-md px-(--espacio-3) py-(--espacio-2) text-sm',
                        'transition-[background-color,color] duration-(--duracion-rapida)',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        '[&_svg]:size-4 [&_svg]:shrink-0',
                        esActivo
                          ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )}
                    >
                      {/* La barra del borde: se localiza de reojo, y no depende del
                          color para decir cuál es el activo. */}
                      {esActivo ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary-foreground"
                        />
                      ) : null}
                      {destino.icono}
                      {colapsada ? null : <span className="truncate">{destino.rotulo}</span>}
                      {destino.insignia === undefined || destino.insignia === 0 ? null : (
                        <span
                          className={cn(
                            'ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-xs font-numeros text-destructive-foreground tabular-nums',
                            colapsada ? 'absolute top-1 right-1 ml-0 px-1 py-0' : '',
                          )}
                        >
                          {destino.insignia}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-sidebar-border p-(--espacio-2)">
        <button
          type="button"
          onClick={() => {
            setColapsada((previo) => !previo);
          }}
          aria-expanded={!colapsada}
          className="flex w-full items-center justify-center rounded-md py-(--espacio-2) text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span aria-hidden="true">{colapsada ? '»' : '«'}</span>
          <span className="sr-only">{colapsada ? 'Ampliar el menú' : 'Colapsar el menú'}</span>
        </button>
        {pie}
      </div>
    </nav>
  );
}

/**
 * ABANICO INFERIOR · el teléfono, al alcance del pulgar.
 *
 * Cinco destinos como mucho. No es una restricción estética: con seis, cada objetivo
 * baja de los 44 px de ancho mínimo en un teléfono estrecho y se falla al tocar.
 *
 * Lleva su respiro contra el área segura: sin él, en un teléfono con barra de gestos
 * el último renglón de la fila queda debajo de la barra del sistema.
 */
export function AbanicoInferior({
  destinos,
  activo,
  alIr,
  className,
}: {
  readonly destinos: readonly DestinoDeNavegacion[];
  readonly activo: string;
  readonly alIr: (clave: string) => void;
  readonly className?: string;
}): ReactElement {
  const cabe = destinos.slice(0, 5);
  return (
    <nav
      aria-label="Navegación"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 backdrop-blur-sm',
        'pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      {cabe.map((destino) => {
        const esActivo = destino.clave === activo;
        return (
          <button
            key={destino.clave}
            type="button"
            onClick={() => {
              alIr(destino.clave);
            }}
            aria-current={esActivo ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-1 py-(--espacio-2) text-xs',
              'transition-colors duration-(--duracion-rapida) active:scale-[0.97]',
              '[&_svg]:size-5',
              esActivo ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {destino.icono}
            <span className="truncate px-1">{destino.rotulo}</span>
            {/* Arriba y no abajo: abajo lo tapa el pulgar justo al tocarlo. */}
            {esActivo ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary"
              />
            ) : null}
            {destino.insignia === undefined || destino.insignia === 0 ? null : (
              <span className="absolute top-1 right-1/4 rounded-full bg-destructive px-1 text-[10px] font-numeros text-destructive-foreground tabular-nums">
                {destino.insignia}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * MIGAS · dónde estoy dentro de algo más grande.
 *
 * Sólo donde hay profundidad de verdad. En una pantalla de primer nivel, unas migas
 * de un solo paso son ruido que ocupa una línea.
 */
export function Migas({
  pasos,
  className,
}: {
  readonly pasos: readonly { readonly rotulo: string; readonly alIr?: () => void }[];
  readonly className?: string;
}): ReactElement {
  return (
    <nav aria-label="Migas de pan" className={cn('flex items-center gap-1 text-sm', className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {pasos.map((paso, indice) => {
          const ultimo = indice === pasos.length - 1;
          return (
            <li key={paso.rotulo} className="flex items-center gap-1">
              {indice > 0 ? (
                <span aria-hidden="true" className="text-muted-foreground">
                  /
                </span>
              ) : null}
              {ultimo || paso.alIr === undefined ? (
                <span aria-current={ultimo ? 'page' : undefined} className="text-foreground">
                  {paso.rotulo}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={paso.alIr}
                  className="rounded-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {paso.rotulo}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
