'use client';

import { Dinero, EsqueletoDeLista } from '@morphiqpos/ui/sistema';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

import {
  costoDeLaCita,
  materialDe,
  type CostoDeLaCita,
  type LineaDeCabina,
  type QuienVeElCosto,
} from './costo-del-servicio.ts';

/**
 * LO QUE LE CUESTA AL SALÓN, a un lado de la cita (C.10 de la 2.4): el material de la
 * receta de cabina de cada servicio y la comisión que va a causar. Cada parte se PIDE sólo si
 * quien entra puede leerla (`costos`, decidido por la página en el servidor): lo que su puesto
 * no lee lee «—», y no se hace una pregunta que se sabe negada —un 403 en cada apertura de
 * la cita, tragado—. El cálculo es de `costo-del-servicio`.
 */
export function CostoDelServicio({
  citaId,
  costos,
  servicioIds,
  precioCentavos,
}: {
  readonly citaId: string;
  /** Qué parte puede leer quien entra: sólo eso se pide. */
  readonly costos: QuienVeElCosto;
  /** Los productos-servicio de la cita: sus recetas son el material. */
  readonly servicioIds: readonly string[];
  readonly precioCentavos: number;
}) {
  const [costo, setCosto] = useState<CostoDeLaCita | null>(null);
  const llave = servicioIds.join(',');

  useEffect(() => {
    const control = new AbortController();
    const ids = llave === '' ? [] : llave.split(',');
    // Lo que el puesto no lee ni se pide: el «—» es la respuesta, no un error tragado.
    const material = costos.material
      ? Promise.all(
          ids.map((id) =>
            consultarPuente<LineaDeCabina>('RecetaEscandallo', {
              filtro: { producto_id: id },
              limite: 60,
              signal: control.signal,
            }),
          ),
        )
          .then((recetas) => materialDe(recetas.flat()))
          // Si quien SÍ puede leerlo no pudo, es un fallo de lectura y se dice «—»: una cifra
          // a medias sería peor.
          .catch(() => null)
      : Promise.resolve(null);
    const comision = costos.comision
      ? invocarComando<{
          readonly comisiones: readonly { readonly sinDescuentoCentavos: string }[];
        }>('/api/venta/cotizar-cita', { citaId }, { signal: control.signal })
          .then((cotizada) =>
            cotizada.comisiones.reduce((suma, c) => suma + Number(c.sinDescuentoCentavos), 0),
          )
          .catch(() => null)
      : Promise.resolve(null);
    void Promise.all([material, comision]).then(([m, c]) => {
      if (!control.signal.aborted) setCosto(costoDeLaCita(precioCentavos, m, c));
    });
    return () => {
      control.abort();
    };
  }, [citaId, costos.material, costos.comision, llave, precioCentavos]);

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
