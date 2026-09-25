'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dinero } from '@morphiqpos/ui/sistema';

import type { ProductoDeCobro } from './lineas.ts';

/**
 * «LOS OCHO DE SIEMPRE» · F1–F8 (`04-INTERFAZ` de abarrotes, PANTALLA 1).
 *
 * El cuaternario de la pantalla: abajo, en una fila, pequeños, y se usan por su TECLA, no
 * por su posición. Son los ocho que la tienda de verdad vende (`venta.mas_vendidos`), no los
 * ocho primeros del catálogo: una fila con la memoria muscular equivocada es peor que no
 * tenerla, así que una tienda que aún no vende nada no ve fila, y una que vendió tres ve
 * tres.
 *
 * En la tableta, sin teclas de función, son ocho botones de 56 px; en el teléfono, una
 * franja que se desliza.
 */

export const TECLAS_RAPIDAS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as const;

/**
 * Las teclas que el cobro YA usa para otra cosa: F2 busca, F4 elige cliente y F6 aparta. En
 * esas posiciones la tecla rápida no se anuncia, para no enseñar una tecla que hace otra
 * cosa; el botón sigue ahí.
 */
const OCUPADAS = new Set(['F2', 'F4', 'F6', 'F7']);

export function teclaDe(indice: number): string | null {
  const tecla = TECLAS_RAPIDAS[indice];
  return tecla === undefined || OCUPADAS.has(tecla) ? null : tecla;
}

export function TeclasRapidas({
  productos,
  onElegir,
}: {
  readonly productos: readonly ProductoDeCobro[];
  readonly onElegir: (producto: ProductoDeCobro) => void;
}) {
  if (productos.length === 0) return null;
  return (
    <nav aria-label="Los más vendidos" className="flex flex-col gap-(--espacio-1)">
      <p className="text-xs font-medium tracking-widest text-texto-sutil uppercase">
        Los de siempre
      </p>
      <div className="flex gap-(--espacio-1) overflow-x-auto pb-(--espacio-1) md:grid md:grid-cols-4 md:overflow-visible xl:grid-cols-8">
        {productos.map((producto, indice) => {
          const tecla = teclaDe(indice);
          return (
            <Button
              key={producto.id}
              type="button"
              variant="outline"
              className="flex h-[calc(var(--altura-control)*1.5)] min-w-28 shrink-0 flex-col items-start justify-center gap-0 px-(--espacio-2) text-left md:w-full"
              aria-keyshortcuts={tecla ?? undefined}
              onClick={() => {
                onElegir(producto);
              }}
            >
              <span className="flex w-full items-baseline justify-between gap-(--espacio-1)">
                <span className="truncate text-sm font-medium">{producto.nombre}</span>
                {tecla === null ? null : (
                  <kbd
                    aria-hidden="true"
                    className="hidden rounded-sm border border-current px-(--espacio-1) font-numeros text-xs md:inline"
                  >
                    {tecla}
                  </kbd>
                )}
              </span>
              <Dinero centavos={producto.precioCentavos} tamano="sm" className="text-texto-sutil" />
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
