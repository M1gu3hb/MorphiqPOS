'use client';

import { Aviso, Dinero, Esqueleto } from '@morphiqpos/ui/sistema';

import type { AbonoHecho } from './AbonoRapido.tsx';

/** Lo que pasó fuera de la lista y hay que decir en ella. */
export type AvisoDeCobro =
  | { readonly tipo: 'apartada'; readonly codigo: string }
  | { readonly tipo: 'retomada'; readonly codigo: string; readonly perdidos: readonly string[] }
  | { readonly tipo: 'abono'; readonly abono: AbonoHecho }
  | { readonly tipo: 'malLeido'; readonly motivo: string };

/** Lo que pasó fuera de la lista: una venta apartada o retomada, un abono, una etiqueta mala. */
export function AvisoDelCobro({ aviso }: { readonly aviso: AvisoDeCobro | null }) {
  if (aviso === null) return null;
  if (aviso.tipo === 'apartada') {
    return (
      <Aviso tono="exito" titulo={`Apartada: es la ${aviso.codigo}.`}>
        Dile el número al cliente: con él se retoma (F6).
      </Aviso>
    );
  }
  if (aviso.tipo === 'retomada') {
    return (
      <Aviso
        tono={aviso.perdidos.length === 0 ? 'exito' : 'atencion'}
        titulo={`Retomada la ${aviso.codigo}.`}
      >
        {aviso.perdidos.length === 0
          ? 'Todo volvió a la lista.'
          : `Ya no están en el catálogo y no se agregaron: ${aviso.perdidos.join(', ')}.`}
      </Aviso>
    );
  }
  if (aviso.tipo === 'abono') {
    const { abono } = aviso;
    return (
      <Aviso
        tono="exito"
        titulo={
          <span className="inline-flex items-baseline gap-(--espacio-1)">
            {abono.nombre} abonó <Dinero centavos={abono.abonoCentavos} tamano="sm" />
          </span>
        }
      >
        {abono.debeCentavos === null ? (
          'Fue por transferencia: baja del saldo cuando se vea en el banco.'
        ) : (
          <span className="inline-flex items-baseline gap-(--espacio-1)">
            Debe <Dinero centavos={abono.debeCentavos} tamano="sm" />
          </span>
        )}
      </Aviso>
    );
  }
  return (
    <Aviso tono="atencion" titulo="La etiqueta no se pudo leer.">
      {aviso.motivo} Pésalo otra vez o búscalo por nombre (F2).
    </Aviso>
  );
}

/**
 * Esqueletos con la forma de la venta, no un spinner: el total a la derecha, el campo y los
 * renglones del ticket a la izquierda. Así nada salta al llegar el catálogo.
 */
export function EsqueletoDelCobro() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Leyendo el catálogo y la caja"
      className="grid gap-(--espacio-3) p-(--espacio-3) md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_26rem]"
    >
      <div className="flex flex-col gap-(--espacio-3) md:col-start-2 md:row-start-1">
        <Esqueleto className="h-40 w-full rounded-lg" />
        <Esqueleto className="hidden h-48 w-full rounded-lg xl:block" />
      </div>
      <div className="flex flex-col gap-(--espacio-2) md:col-start-1 md:row-start-1">
        <Esqueleto className="h-(--altura-control) w-full" />
        {Array.from({ length: 6 }, (_, indice) => (
          <div key={indice} className="flex items-center gap-(--espacio-3) py-(--espacio-1)">
            <Esqueleto className="h-4 w-8" />
            <Esqueleto className="h-4 flex-1" />
            <Esqueleto className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
