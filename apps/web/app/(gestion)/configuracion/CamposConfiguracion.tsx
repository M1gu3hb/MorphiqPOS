import { Store } from 'lucide-react';
import type { ReactNode } from 'react';

import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';

export function Campo({
  id,
  etiqueta,
  children,
}: {
  id: string;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
    </div>
  );
}

export function Color({
  id,
  etiqueta,
  valor,
  alCambiar,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className="flex items-center gap-2 rounded-md border p-2">
        <Input
          id={id}
          className="size-[calc(var(--altura-control)*0.8)] shrink-0 border-0 p-0 shadow-none"
          type="color"
          value={valor}
          onChange={(evento) => {
            alCambiar(evento.target.value);
          }}
        />
        <span className="numeros text-xs text-texto-sutil">{valor.toUpperCase()}</span>
      </div>
    </div>
  );
}

export function VistaPrevia({
  nombre,
  logoUrl,
  paquete,
  primario,
  acento,
}: {
  nombre: string;
  logoUrl: string;
  paquete: string;
  primario: string;
  acento: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-fondo-sutil">
      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${primario}, ${acento})` }}
      />
      <div className="flex items-center gap-3 p-4">
        <div className="grid size-[calc(var(--altura-control)*1.2)] place-items-center overflow-hidden rounded-lg bg-superficie shadow-1">
          {logoUrl === '' ? (
            <Store
              aria-hidden="true"
              className="size-[calc(var(--altura-control)*0.6)] text-primario"
            />
          ) : (
            <span className="text-xs font-bold">LOGO</span>
          )}
        </div>
        <div>
          <p className="font-display font-semibold">{nombre || 'Tu negocio'}</p>
          <p className="text-xs text-texto-sutil">MorphiqPOS · {paquete}</p>
        </div>
      </div>
    </div>
  );
}
