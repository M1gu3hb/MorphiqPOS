import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { useId } from 'react';

import { opcionesDeArea, type ValorDeArea } from './area-de-preparacion';

/**
 * «Área de preparación» de un platillo, para Recetas y Platillos (DP-9.1). Al crear ofrece
 * «Según su categoría», que deja que el servidor la aprenda; al editar, sólo las áreas reales.
 */
export function AreaDePreparacionSelect({
  valor,
  alCambiar,
  alCrear,
}: {
  readonly valor: ValorDeArea;
  readonly alCambiar: (valor: ValorDeArea) => void;
  readonly alCrear: boolean;
}) {
  const id = useId();
  const opciones = opcionesDeArea(alCrear);
  return (
    <span className="flex flex-col gap-(--espacio-1)">
      <Label htmlFor={id} className="text-xs">
        Área de preparación
      </Label>
      <Select
        value={valor}
        onValueChange={(elegido) => {
          const opcion = opciones.find((o) => o.valor === elegido);
          if (opcion !== undefined) alCambiar(opcion.valor);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}
