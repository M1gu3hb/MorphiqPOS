'use client';

import type { Vocabulario } from '@morphiqpos/domain/vocabulario';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dinero, type ColumnaDeTabla } from '@morphiqpos/ui/sistema';
import { Circle, Minus } from 'lucide-react';

import { subtotalDe, type LineaDeVenta } from './lineas.ts';

/**
 * El ticket, en columnas: cantidad, nombre, precio e importe, cada uno en la suya y con
 * cifras tabulares, para que un `× 6` equivocado salte a la vista. La tableta pierde el
 * precio unitario si no cabe; la cantidad y el importe, nunca.
 */
export function columnasDeLaVenta(
  voc: Vocabulario,
  onQuitar: (linea: LineaDeVenta) => void,
): readonly ColumnaDeTabla<LineaDeVenta>[] {
  return [
    {
      clave: 'cantidad',
      titulo: 'Cant.',
      numerica: true,
      // Nunca se pierde, en ningún ancho: es la que se verifica de reojo.
      celda: (linea) => (
        <span className="font-bold">
          {linea.cantidad} {linea.granel ? (linea.unidad ?? '') : '×'}
        </span>
      ),
    },
    {
      clave: 'producto',
      titulo: voc.titulo('producto'),
      celda: (linea) => (
        <span className="line-clamp-2">
          {linea.nombre}
          {linea.unidad !== null && !linea.granel ? (
            <span className="text-texto-sutil"> · {linea.unidad}</span>
          ) : null}
          {/* El color nunca es el único portador: va la palabra junto al punto. */}
          {linea.sinExistencia && (
            <span className="ml-(--espacio-2) inline-flex items-center gap-(--espacio-1) text-xs text-texto-sutil">
              <Circle aria-hidden="true" className="size-2 fill-advertencia text-advertencia" />
              sin existencia
            </span>
          )}
        </span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      desde: 'lg',
      celda: (linea) => (
        <Dinero centavos={linea.precioCentavos} tamano="sm" className="text-texto-sutil" />
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => <Dinero centavos={subtotalDe(linea)} className="font-medium" />,
    },
    {
      clave: 'quitar',
      titulo: 'Quitar',
      celda: (linea) => (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={linea.granel ? `Quitar ${linea.nombre}` : `Quitar uno de ${linea.nombre}`}
          onClick={() => {
            onQuitar(linea);
          }}
        >
          <Minus />
        </Button>
      ),
    },
  ];
}
