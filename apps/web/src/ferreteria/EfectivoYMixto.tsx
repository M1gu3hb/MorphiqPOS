'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, Dinero, Superficie } from '@morphiqpos/ui/sistema';
import { useState } from 'react';

import {
  billetesSugeridos,
  cambioDe,
  cambioDelMixto,
  faltaDelMixto,
  pagosDelMixto,
  type MetodoDeDinero,
  type MontosDelMixto,
  type PagoDeNota,
} from './cobro-de-nota';

/**
 * PIEZA · ferreteria · cobrar en efectivo con cambio, o en mixto
 *
 * La caja sellaba UN método por nota y en efectivo mandaba lo recibido igual al total:
 * no había cambio que calcular ni forma de pagar $2,000 en efectivo y el resto con
 * tarjeta, que en un ticket de $6,000 es lo normal (C.5 de la 2.4).
 *
 * ── Efectivo ─────────────────────────────────────────────────────────────
 * Cuánto dio el cliente —con los billetes probables a un toque— y el CAMBIO en grande,
 * porque es el número que la cajera cuenta en la mano. COBRAR no se enciende con menos
 * dinero del que cuesta la nota. El servidor recalcula el cambio con lo recibido.
 *
 * ── Mixto ────────────────────────────────────────────────────────────────
 * Los tres métodos que mueven dinero, con su importe y el renglón de lo que falta o
 * sobra. «A cuenta» no entra: no es dinero, es una remisión firmada.
 */

const ETIQUETAS: Readonly<Record<MetodoDeDinero, string>> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

const SIN_MONTOS: MontosDelMixto = { efectivo: null, tarjeta: null, transferencia: null };

export interface EfectivoYMixtoProps {
  readonly total: number;
  readonly paso: 'efectivo' | 'mixto';
  readonly cobrando: boolean;
  readonly alCobrar: (pagos: readonly PagoDeNota[]) => void;
  readonly alCancelar: () => void;
}

export function EfectivoYMixto({
  total,
  paso,
  cobrando,
  alCobrar,
  alCancelar,
}: EfectivoYMixtoProps) {
  const [recibido, setRecibido] = useState<number | null>(null);
  const [montos, setMontos] = useState<MontosDelMixto>(SIN_MONTOS);
  /** La `key` del campo de lo recibido: un billete tocado lo reescribe remontándolo. */
  const [reinicio, setReinicio] = useState(0);

  function recibir(centavos: number): void {
    setRecibido(centavos);
    setReinicio((previo) => previo + 1);
  }

  const campoDeRecibido = (
    <span className="grid grid-cols-[7rem_1fr] items-center gap-(--espacio-2)">
      <Label htmlFor="caja-recibido">Recibido</Label>
      <CampoDeDinero
        key={reinicio}
        id="caja-recibido"
        autoFocus
        placeholder="0.00"
        centavos={recibido}
        alCambiar={setRecibido}
      />
    </span>
  );

  if (paso === 'efectivo') {
    const cambio = cambioDe(total, recibido);
    return (
      <Superficie nivel={0} relleno={3} radio="md" className="flex flex-col gap-(--espacio-3)">
        {campoDeRecibido}
        <div className="flex flex-wrap gap-(--espacio-2)">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              recibir(total);
            }}
          >
            Exacto
          </Button>
          {billetesSugeridos(total).map((billete) => (
            <Button
              key={billete}
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Recibido ${String(billete / 100)} pesos`}
              onClick={() => {
                recibir(billete);
              }}
            >
              <Dinero centavos={billete} tamano="sm" />
            </Button>
          ))}
        </div>
        {cambio === null ? (
          <p className="text-sm text-texto-sutil">
            {recibido === null ? 'Di cuánto dio el cliente.' : 'Con eso no alcanza para la nota.'}
          </p>
        ) : (
          <p
            aria-live="polite"
            className="flex items-baseline justify-between gap-(--espacio-2) border-t border-borde pt-(--espacio-2)"
          >
            <span className="text-sm font-medium tracking-wide text-texto-sutil uppercase">
              Cambio
            </span>
            <Dinero centavos={cambio} tamano="xl" />
          </p>
        )}
        <div className="flex justify-end gap-(--espacio-2)">
          <Button type="button" variant="ghost" onClick={alCancelar} disabled={cobrando}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="lg"
            cargando={cobrando}
            disabled={cobrando || cambio === null}
            onClick={() => {
              if (recibido === null) return;
              alCobrar([{ metodo: 'efectivo', montoCentavos: total, recibidoCentavos: recibido }]);
            }}
          >
            {cobrando ? 'Cobrando…' : 'Cobrar en efectivo'}
          </Button>
        </div>
      </Superficie>
    );
  }

  const falta = faltaDelMixto(total, montos);
  const cambio = cambioDelMixto(montos, recibido);
  const efectivo = montos.efectivo ?? 0;
  return (
    <Superficie nivel={0} relleno={3} radio="md" className="flex flex-col gap-(--espacio-2)">
      {(['efectivo', 'tarjeta', 'transferencia'] as const).map((metodo) => (
        <span key={metodo} className="grid grid-cols-[7rem_1fr] items-center gap-(--espacio-2)">
          <Label htmlFor={`caja-mixto-${metodo}`}>{ETIQUETAS[metodo]}</Label>
          <CampoDeDinero
            id={`caja-mixto-${metodo}`}
            placeholder="0.00"
            centavos={montos[metodo]}
            alCambiar={(centavos) => {
              setMontos((previos) => ({ ...previos, [metodo]: centavos }));
            }}
          />
        </span>
      ))}
      {falta === 0 ? (
        <p className="text-sm text-exito">Cuadra con el total de la nota.</p>
      ) : (
        <Aviso
          tono="atencion"
          titulo={
            <>
              {falta > 0 ? 'Faltan ' : 'Sobran '}
              <Dinero centavos={Math.abs(falta)} tamano="sm" />
            </>
          }
        />
      )}
      {efectivo > 0 && (
        <>
          {campoDeRecibido}
          {cambio !== null && cambio > 0 && (
            <p className="flex items-baseline justify-between gap-(--espacio-2)">
              <span className="text-sm text-texto-sutil">Cambio del efectivo</span>
              <Dinero centavos={cambio} tamano="lg" />
            </p>
          )}
        </>
      )}
      <div className="flex justify-end gap-(--espacio-2)">
        <Button type="button" variant="ghost" onClick={alCancelar} disabled={cobrando}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="lg"
          cargando={cobrando}
          disabled={cobrando || falta !== 0 || cambio === null}
          onClick={() => {
            alCobrar(pagosDelMixto(montos, recibido));
          }}
        >
          {cobrando ? 'Cobrando…' : 'Cobrar mixto'}
        </Button>
      </div>
    </Superficie>
  );
}
