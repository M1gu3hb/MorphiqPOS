'use client';

import { Dinero, EsqueletoDeLista } from '@morphiqpos/ui/sistema';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

import {
  costoDeLaCita,
  materialDe,
  type CostoDeLaCita,
  type LineaDeCabina,
} from './costo-del-servicio.ts';

/**
 * LO QUE LE CUESTA AL SALÓN, a un lado de la cita (C.10 de la 2.4): el material de la
 * receta de cabina de cada servicio y la comisión que va a causar. Quien no ve costos
 * —la estilista— lee «—» en vez de una cifra a medias; el cálculo es de `costo-del-servicio`.
 */
export function CostoDelServicio({
  citaId,
  servicioIds,
  precioCentavos,
}: {
  readonly citaId: string;
  /** Los productos-servicio de la cita: sus recetas son el material. */
  readonly servicioIds: readonly string[];
  readonly precioCentavos: number;
}) {
  const [costo, setCosto] = useState<CostoDeLaCita | null>(null);
  const llave = servicioIds.join(',');

  useEffect(() => {
    const control = new AbortController();
    const ids = llave === '' ? [] : llave.split(',');
    const material = Promise.all(
      ids.map((id) =>
        consultarPuente<LineaDeCabina>('RecetaEscandallo', {
          filtro: { producto_id: id },
          limite: 60,
          signal: control.signal,
        }),
      ),
    )
      .then((recetas) => materialDe(recetas.flat()))
      .catch(() => null);
    const comision = invocarComando<{
      readonly comisiones: readonly { readonly sinDescuentoCentavos: string }[];
    }>('/api/venta/cotizar-cita', { citaId }, { signal: control.signal })
      .then((cotizada) =>
        cotizada.comisiones.reduce((suma, c) => suma + Number(c.sinDescuentoCentavos), 0),
      )
      .catch(() => null);
    void Promise.all([material, comision]).then(([m, c]) => {
      if (!control.signal.aborted) setCosto(costoDeLaCita(precioCentavos, m, c));
    });
    return () => {
      control.abort();
    };
  }, [citaId, llave, precioCentavos]);

  if (costo === null) return <EsqueletoDeLista filas={1} />;
  const importe = (centavos: number | null) =>
    centavos === null ? (
      <span className="text-texto-sutil">—</span>
    ) : (
      <Dinero centavos={centavos} tamano="sm" />
    );
  return (
    <dl className="grid grid-cols-3 gap-(--espacio-3) text-sm">
      <div className="flex flex-col">
        <dt className="text-xs text-texto-sutil">Material de cabina</dt>
        <dd>{importe(costo.materialCentavos)}</dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-xs text-texto-sutil">Comisión</dt>
        <dd>{importe(costo.comisionCentavos)}</dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-xs text-texto-sutil">Le queda al salón</dt>
        <dd className="font-semibold">{importe(costo.leQuedaCentavos)}</dd>
      </div>
    </dl>
  );
}
