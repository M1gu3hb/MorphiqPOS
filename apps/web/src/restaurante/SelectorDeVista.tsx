'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Superficie } from '@morphiqpos/ui/sistema';
import { Bell, LayoutGrid } from 'lucide-react';

import type { VistaDeMesas } from './vista-de-solicitudes';

/**
 * Mesas o Solicitudes (DP-9.3): va ARRIBA de las zonas. «Solicitudes» convierte la pantalla
 * entera en la lista de pendientes, y es la única vista donde la voz las anuncia.
 */
export function SelectorDeVista({
  vista,
  pendientes,
  alCambiar,
}: {
  readonly vista: VistaDeMesas;
  readonly pendientes: number;
  readonly alCambiar: (vista: VistaDeMesas) => void;
}) {
  const opcion = (cual: VistaDeMesas) => ({
    type: 'button' as const,
    size: 'sm' as const,
    variant: vista === cual ? ('default' as const) : ('ghost' as const),
    'aria-pressed': vista === cual,
    onClick: () => {
      alCambiar(cual);
    },
  });
  return (
    <Superficie
      role="group"
      aria-label="Qué ver"
      relleno={0}
      radio="md"
      className="inline-flex gap-(--espacio-1) self-start p-(--espacio-1)"
    >
      <Button {...opcion('mesas')}>
        <LayoutGrid aria-hidden />
        Mesas
      </Button>
      <Button {...opcion('solicitudes')}>
        <Bell aria-hidden />
        Solicitudes
        {pendientes > 0 ? (
          <span className="min-w-5 rounded-full bg-peligro px-1 text-xs font-bold text-peligro-texto">
            {pendientes}
          </span>
        ) : null}
      </Button>
    </Superficie>
  );
}
