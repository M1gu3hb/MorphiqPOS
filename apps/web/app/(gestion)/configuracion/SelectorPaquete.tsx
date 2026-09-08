'use client';

import { Coffee, Cross, Hammer, ShoppingBasket, UtensilsCrossed } from 'lucide-react';

import type { Paquete } from '@morphiqpos/contracts';
import { Badge } from '@morphiqpos/ui/primitivas/badge';

import { PAQUETES_NEGOCIO } from './paquetes';

const ICONOS = {
  tienda: ShoppingBasket,
  ferreteria: Hammer,
  farmacia: Cross,
  cafeteria: Coffee,
  restaurante: UtensilsCrossed,
} as const;

export function SelectorPaquete({
  valor,
  alCambiar,
}: {
  readonly valor: Paquete;
  readonly alCambiar: (valor: Paquete) => void;
}) {
  return (
    <fieldset className="grid gap-4">
      <legend className="sr-only">Tipo de negocio</legend>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {PAQUETES_NEGOCIO.map((paquete) => {
          const Icono = ICONOS[paquete.id];
          const seleccionado = valor === paquete.id;
          return (
            <label
              key={paquete.id}
              className="relative grid cursor-pointer gap-4 rounded-xl border bg-superficie p-5 shadow-1 transition hover:-translate-y-0.5 hover:shadow-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-anillo data-[seleccionado=true]:border-primario data-[seleccionado=true]:shadow-2"
              data-seleccionado={seleccionado || undefined}
            >
              <input
                className="sr-only"
                type="radio"
                name="paquete"
                value={paquete.id}
                checked={seleccionado}
                onChange={() => {
                  alCambiar(paquete.id);
                }}
              />
              <span className="flex items-center justify-between">
                <span className="grid size-[var(--altura-control)] place-items-center rounded-lg bg-fondo-sutil text-primario">
                  <Icono aria-hidden="true" className="size-5" />
                </span>
                {seleccionado && <Badge>Activo</Badge>}
              </span>
              <span className="grid gap-2">
                <strong>{paquete.nombre}</strong>
                <span className="text-sm leading-relaxed text-texto-sutil">
                  {paquete.descripcion}
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {paquete.capacidades.map((capacidad) => (
                  <Badge key={capacidad} variant="outline">
                    {capacidad}
                  </Badge>
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
