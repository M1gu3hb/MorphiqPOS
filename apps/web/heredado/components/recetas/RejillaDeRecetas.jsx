'use client';
import React from 'react';
import { Esqueleto } from '@morphiqpos/ui/sistema';
import { Card } from '@/components/ui/card';

/**
 * LA REJILLA DE LAS RECETAS: precio, costo, utilidad y margen en las MISMAS columnas.
 *
 * Antes cada fila era un `flex-wrap` con cifras centradas: un nombre largo empujaba las
 * cifras a otra línea, y una cifra de cuatro dígitos se centraba en otro punto que una
 * de dos. Con 40 platillos, las columnas bailaban fila por fila.
 *
 * Ahora la fila es una rejilla de columnas FIJAS y las cifras van pegadas a la derecha
 * con dígitos tabulares: el nombre cede (se recorta con puntos suspensivos), las cifras
 * no. Todas las filas usan esta misma cadena, así que `x` es el mismo en todas.
 *
 * El ancho que decide la forma es el de la LISTA, no el de la ventana (`@container`): en
 * PC la barra lateral se come 240 px y en tableta no, y una consulta de ventana se
 * equivocaría en uno de los dos.
 *
 *   · lista de 42 rem o más (tabla): nombre | precio | costo | utilidad | margen | flecha,
 *     con una fila de encabezados arriba.
 *   · menos (tarjeta, teléfono): el nombre arriba con su flecha, y debajo las cuatro
 *     cifras en dos columnas, cada una con su etiqueta a la izquierda y su cifra a la
 *     derecha. Las tarjetas se parecen entre sí: las cifras caen en los mismos sitios.
 */
export const COLUMNAS_DE_LA_TABLA =
  '@2xl:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_5.5rem_6.5rem_2.25rem]';

export const REJILLA_DE_FILA = `grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 ${COLUMNAS_DE_LA_TABLA}`;

/** Las cuatro cifras en tarjeta; en tabla se vuelven columnas de la rejilla de la fila. */
export const CIFRAS_DE_FILA = 'col-span-2 grid grid-cols-2 gap-x-6 gap-y-2 @2xl:contents';

/** La flecha: arriba a la derecha en tarjeta, última columna en tabla. */
export const CELDA_DE_LA_FLECHA = 'col-start-2 row-start-1 @2xl:col-auto @2xl:row-auto';

/** Una cifra de la fila: con su etiqueta en tarjeta, sola y a la derecha en tabla. */
export function CifraDeFila({ clave, etiqueta, nota, notaSoloEnTabla = false, children }) {
  return (
    <div data-cifra={clave} className="flex items-start justify-between gap-3 @2xl:block">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground @2xl:sr-only">
        {etiqueta}
      </span>
      <div className="min-w-0 text-right">
        <div className="font-heading font-bold tabular-nums leading-tight">{children}</div>
        {nota && (
          <p
            className={`text-[10px] leading-tight text-muted-foreground ${notaSoloEnTabla ? 'hidden @2xl:block' : ''}`}
          >
            {nota}
          </p>
        )}
      </div>
    </div>
  );
}

/** La fila de encabezados: sólo existe cuando la lista es tabla. */
export function EncabezadoDeColumnas() {
  return (
    <div
      aria-hidden="true"
      className={`hidden gap-x-3 px-[17px] pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground @2xl:grid ${COLUMNAS_DE_LA_TABLA}`}
    >
      <span>Producto</span>
      <span className="text-right">Precio</span>
      <span className="text-right">Costo</span>
      <span className="text-right">Utilidad</span>
      <span className="text-right">Margen</span>
      <span />
    </div>
  );
}

/**
 * El esqueleto de la lista: la FORMA de las filas que van a llegar, no una rueda.
 * Misma rejilla que la fila de verdad, así que al llegar los datos nada salta.
 */
export function EsqueletoDeRecetas({ filas = 6 }) {
  return (
    <div className="@container" role="status" aria-busy="true" aria-label="Cargando recetas">
      <EncabezadoDeColumnas />
      <div className="space-y-2">
        {Array.from({ length: filas }, (_, i) => (
          <Card key={i} className="p-4">
            <div className={REJILLA_DE_FILA}>
              <div className="space-y-2">
                <Esqueleto className="h-4 w-2/3" />
                <Esqueleto className="h-3 w-1/3" />
              </div>
              <div className={CIFRAS_DE_FILA}>
                {Array.from({ length: 4 }, (_unused, j) => (
                  <Esqueleto key={j} className="h-5 w-full @2xl:ml-auto @2xl:w-16" />
                ))}
              </div>
              <Esqueleto redondo className={`size-9 ${CELDA_DE_LA_FLECHA}`} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
