'use client';

import { Input } from '@morphiqpos/ui/primitivas/input';
import type { ComponentProps } from 'react';

/**
 * EL IMPORTE QUE SE TECLEA · con su `$` delante y las cifras a la derecha.
 *
 * Vivía en la caja de la tienda; ahora lo usan también el retiro y el salón (D.1 de la
 * 2.4). Tiene la forma de `CampoDeDinero` y no es `CampoDeDinero` porque aquí lo tecleado
 * se guarda como TEXTO y lo lee `aCentavos` (`importe-tecleado.ts`), que es lo que llega
 * al servidor: la coma es siempre el decimal, cada importe admite hasta siete cifras de
 * pesos, uno vacío es cero y uno mal escrito detiene el envío. `CampoDeDinero` lee además
 * «1,250» como mil doscientos cincuenta, que aquí no es un importe.
 */

export interface CampoDePesosProps extends Omit<
  ComponentProps<'input'>,
  'type' | 'inputMode' | 'className'
> {
  /**
   * El `id` del control al que lleva Enter. Sin él, Enter hace lo de siempre en un
   * formulario: registrarlo. Un importe a medias no registra nada.
   */
  readonly siguiente?: string | undefined;
}

export function CampoDePesos({ siguiente, onKeyDown, ...props }: CampoDePesosProps) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-(--espacio-3) -translate-y-1/2 text-sm text-texto-sutil"
      >
        $
      </span>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        onKeyDown={(evento) => {
          onKeyDown?.(evento);
          if (siguiente === undefined || evento.key !== 'Enter') return;
          // Un importe a medias no registra nada: Enter lleva al campo que sigue.
          evento.preventDefault();
          document.getElementById(siguiente)?.focus();
        }}
        className="h-[calc(var(--altura-control)*1.25)] pl-(--espacio-6) text-right font-numeros text-lg tabular-nums md:text-lg"
      />
    </div>
  );
}
