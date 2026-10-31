'use client';

import { Aviso } from '@morphiqpos/ui/sistema';
import { Users } from 'lucide-react';

import { personasConectadas, type EstadoDelCarrito } from './carrito-de-la-mesa';

/**
 * Arriba del portal (DP-9.5): cuántos teléfonos tienen abierto el pedido de la mesa y, si son
 * dos o más —o la mesa se abrió para dos o más—, que esperen a que todos agreguen antes de
 * enviar. Con uno solo, sólo el conteo.
 */
export function AvisoDeLaMesa({ estado }: { readonly estado: EstadoDelCarrito | null }) {
  if (estado === null || estado.conectados === 0) return null;
  return (
    <div className="flex flex-col gap-(--espacio-2)" data-pedido-compartido>
      <p className="flex items-center gap-(--espacio-2) text-sm text-texto-sutil" role="status">
        <Users className="size-4" aria-hidden />
        {personasConectadas(estado.conectados)}
      </p>
      {estado.esperarATodos ? (
        <Aviso tono="atencion" titulo="Esperen a que todos agreguen su pedido antes de enviarlo." />
      ) : null}
    </div>
  );
}
