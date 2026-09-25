'use client';

import { Cifra, Tabla, Vacio, type ColumnaDeTabla } from '@morphiqpos/ui/sistema';
import { Check, CircleAlert, ClipboardList, Plus, X } from 'lucide-react';
import { useMemo } from 'react';

import { useVocabulario } from '~/cliente/vocabulario';

import {
  compararContraPedido,
  type LoPedido,
  type PartidaDeLaNota,
  type RenglonDelComparativo,
} from './entrada-del-archivo.ts';

/**
 * EL CAMINO 2 · escanear contra el pedido (C.10 de la 2.4).
 *
 * Lo que se le pidió al proveedor —el pedido sugerido que se le mandó— contra lo que
 * se va capturando de la caja que llegó. Lo que se pidió y no llegó va PRIMERO: es lo
 * que se le reclama al repartidor antes de firmarle, no el lunes. El sistema no lleva
 * pedidos en tránsito (ver la cabecera de Entradas): lo pedido es la sugerencia de hoy.
 */

const ESTADOS: Record<
  RenglonDelComparativo['estado'],
  { readonly palabra: string; readonly tono: string; readonly icono: typeof Check }
> = {
  no_llego: { palabra: 'No llegó', tono: 'text-peligro font-semibold', icono: X },
  falta: { palabra: 'Llegó de menos', tono: 'text-advertencia font-semibold', icono: CircleAlert },
  sobra: { palabra: 'Llegó de más', tono: 'text-advertencia', icono: Plus },
  completo: { palabra: 'Completo', tono: 'text-exito', icono: Check },
  no_se_pidio: { palabra: 'No se pidió', tono: 'text-texto-sutil', icono: Plus },
};

export function ContraElPedido({
  pedido,
  llego,
}: {
  readonly pedido: readonly LoPedido[];
  readonly llego: readonly Pick<PartidaDeLaNota, 'insumoId' | 'nombre' | 'cantidad'>[];
}) {
  const voc = useVocabulario();
  const filas = useMemo(() => compararContraPedido(pedido, llego), [pedido, llego]);
  const faltantes = filas.filter((f) => f.estado === 'no_llego' || f.estado === 'falta').length;

  const columnas: readonly ColumnaDeTabla<RenglonDelComparativo>[] = [
    {
      clave: 'material',
      titulo: voc.titulo('producto'),
      celda: (f) => <span className="font-medium">{f.material}</span>,
    },
    {
      clave: 'pedido',
      titulo: 'Pedido',
      celda: (f) => <span className="whitespace-nowrap">{f.pedido ?? '—'}</span>,
    },
    {
      clave: 'llego',
      titulo: 'Llegó',
      numerica: true,
      celda: (f) => <Cifra valor={f.llegoPresentaciones} tamano="sm" />,
    },
    {
      clave: 'estado',
      titulo: 'Cómo llegó',
      // La palabra SIEMPRE viaja con su color y su icono.
      celda: (f) => {
        const { palabra, tono, icono: Icono } = ESTADOS[f.estado];
        return (
          <span className={`inline-flex items-center gap-(--espacio-1) ${tono}`}>
            <Icono aria-hidden="true" className="size-4 shrink-0" />
            {palabra}
          </span>
        );
      },
    },
  ];

  return (
    <section aria-label="Lo pedido contra lo que llegó" className="flex flex-col gap-(--espacio-2)">
      <h3 className="flex flex-wrap items-baseline gap-x-(--espacio-2) text-sm font-semibold">
        Lo pedido contra lo que llegó
        <span className="text-xs font-normal text-texto-sutil">
          {faltantes === 0
            ? 'nada pendiente de reclamar'
            : `${String(faltantes)} por reclamar antes de firmar`}
        </span>
      </h3>
      <Tabla
        etiqueta="Lo pedido contra lo que llegó"
        columnas={columnas}
        filas={filas}
        claveDe={(f) => f.insumoId}
        tonoDeFila={(f) => (f.estado === 'no_llego' ? 'peligro' : undefined)}
        alto="max-h-[40vh]"
        vacio={
          <Vacio
            icono={<ClipboardList />}
            titulo="No hay pedido contra el cual comparar"
            explicacion="Lo pedido es la sugerencia de este proveedor. Sin sugerencia, captura lo que llegó y se guarda igual."
            className="px-(--espacio-3) py-(--espacio-6)"
          />
        }
      />
    </section>
  );
}
