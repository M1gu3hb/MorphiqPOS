'use client';
import React from 'react';
import { Esqueleto } from '@morphiqpos/ui/sistema';
import { Card } from '@/components/ui/card';

/**
 * Las tarjetas del catálogo se reparten solas en columnas de 17 rem como mínimo, y de ahí
 * hacia arriba: una en teléfono, dos en tableta, tres o más en PC. 17 rem es lo que
 * necesita el pie de la tarjeta —«En POS», «Opciones» y «Ficha»— para caber en una línea.
 * Lo comparten la lista de verdad y su esqueleto: al llegar los datos, nada se mueve.
 */
export const REJILLA_DE_TARJETAS = 'grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4';

/** El esqueleto del catálogo: la FORMA de las tarjetas que van a llegar, no una rueda. */
export default function EsqueletoDeProductos({ tarjetas = 8 }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando productos"
      className={REJILLA_DE_TARJETAS}
    >
      {Array.from({ length: tarjetas }, (_, i) => (
        <Card key={i} className="flex flex-col overflow-hidden">
          <Esqueleto className="aspect-[16/9] w-full rounded-none" />
          <div className="space-y-3 p-4">
            <div className="grid min-h-[3.75rem] grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <div className="space-y-2">
                <Esqueleto className="h-4 w-3/4" />
                <Esqueleto className="h-3 w-1/2" />
              </div>
              <Esqueleto className="h-6 w-16" />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 3 }, (_unused, j) => (
                <Esqueleto key={j} className="h-[3.25rem]" />
              ))}
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <Esqueleto className="h-5 w-14" />
              <Esqueleto className="h-7 w-28" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
