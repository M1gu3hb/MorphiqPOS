'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, Dinero, Superficie } from '@morphiqpos/ui/sistema';
import { useState } from 'react';

/**
 * EL MURO DE LA PROPINA del cobro del restaurante: sin decidirla no se cobra, y «Sin
 * propina» pesa lo mismo que los porcentajes porque es voluntaria (`02-DINERO-Y-CAJA`
 * §4.1, Profeco 2026). Además de los porcentajes con su importe, OTRA CANTIDAD tecleada:
 * la mesa que deja $150 redondos no es un porcentaje.
 *
 * Vivía dentro de `Cobro.tsx`; salió a su archivo tal cual cuando el cobro ganó el
 * descuento y la cancelación (día completo del restaurante, 2.4) y pasaba de las 800
 * líneas. Quien lo monta le pone `key` con la cuenta: lo tecleado es de ESA cuenta.
 */

/** En PUNTOS BASE, como viaja el porcentaje en el sistema. El 0 es «sin». */
const PROPINAS = [1000, 1250, 1500, 0];

export function ParedDePropina({
  venta,
  alElegir,
}: {
  /** La venta sin propina, en centavos: la base de cada porcentaje. */
  readonly venta: number;
  readonly alElegir: (propinaCentavos: number) => void;
}) {
  /** La propina tecleada en «otra cantidad», antes de usarla. */
  const [otraPropina, setOtraPropina] = useState<number | null>(null);
  return (
    <div role="group" aria-label="Propina" className="flex flex-col gap-(--espacio-2)">
      <Aviso tono="atencion" titulo="Confirma la propina antes de cobrar." />
      <ul className="grid grid-cols-2 gap-(--espacio-2) sm:grid-cols-4">
        {PROPINAS.map((puntos) => {
          const importe = Math.round((venta * puntos) / 10000);
          return (
            <li key={puntos}>
              <Superficie
                como="button"
                type="button"
                interactiva
                relleno={3}
                radio="md"
                onClick={() => {
                  alElegir(importe);
                }}
                className="flex min-h-20 w-full flex-col items-center justify-center gap-(--espacio-1) text-center"
              >
                <span className="text-sm font-semibold">
                  {puntos === 0 ? 'Sin propina' : `${String(puntos / 100)} %`}
                </span>
                <Dinero centavos={importe} tamano="xs" className="text-texto-sutil" />
              </Superficie>
            </li>
          );
        })}
      </ul>
      <div className="flex items-end gap-(--espacio-2)">
        <span className="flex flex-1 flex-col gap-(--espacio-1)">
          <Label htmlFor="cobro-otra-propina">Otra cantidad</Label>
          <CampoDeDinero
            id="cobro-otra-propina"
            placeholder="0.00"
            centavos={otraPropina}
            alCambiar={setOtraPropina}
          />
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={otraPropina === null}
          onClick={() => {
            if (otraPropina !== null) alElegir(otraPropina);
          }}
        >
          Usar
        </Button>
      </div>
    </div>
  );
}
