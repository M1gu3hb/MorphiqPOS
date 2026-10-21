'use client';
import React from 'react';
import { Esqueleto } from '@morphiqpos/ui/sistema';
import { Card } from '@/components/ui/card';

/**
 * LA FILA DEL INVENTARIO: nombre | existencias | acciones, en columnas FIJAS.
 *
 * Mismo criterio que las recetas: el nombre cede, las existencias y las acciones no, así
 * que una fila con «Aceite de oliva extra virgen» y otra con «Sal» tienen sus cifras y sus
 * botones en el mismo sitio. Cuando la lista es angosta (teléfono) la fila pasa a tarjeta:
 * el nombre arriba, y debajo las existencias a la izquierda y las acciones a la derecha.
 * El ancho que decide es el de la lista (`@container`), no el de la ventana: en PC la
 * barra lateral se come 240 px y en tableta no.
 */
export const FILA_DE_INVENTARIO =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 @2xl:grid-cols-[minmax(0,1fr)_11rem_auto]';

/** El esqueleto de la lista: filas con la forma de las de verdad, no una rueda suelta. */
export default function EsqueletoDeInventario({ filas = 6 }) {
  return (
    <div
      className="@container space-y-2"
      role="status"
      aria-busy="true"
      aria-label="Cargando inventario"
    >
      {Array.from({ length: filas }, (_, i) => (
        <Card key={i} className="p-4">
          <div className={FILA_DE_INVENTARIO}>
            <div className="col-span-2 space-y-2 @2xl:col-span-1">
              <Esqueleto className="h-4 w-1/2" />
              <Esqueleto className="h-3 w-2/3" />
            </div>
            <div className="space-y-2 @2xl:ml-auto @2xl:w-28">
              <Esqueleto className="h-5 w-24 @2xl:ml-auto" />
              <Esqueleto className="h-3 w-20 @2xl:ml-auto" />
            </div>
            <Esqueleto className="h-8 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}
