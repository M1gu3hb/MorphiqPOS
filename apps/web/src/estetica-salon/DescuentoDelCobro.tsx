'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, Dinero, Esqueleto, Superficie } from '@morphiqpos/ui/sistema';
import { BadgePercent } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * PIEZA · estetica-salon · el descuento de un cobro
 *
 * «Descuento 20 % · el ticket baja de $1,130 a $904 · tu comisión baja de $565 a $452
 * (−$113) [CANCELAR] [APLICAR]» (`02-DINERO-Y-CAJA §3`). Esa frase es la pieza: con
 * ella de por medio el descuento se aplica cuando vale la pena y no por reflejo, y la
 * profesional no reclama el domingo la comisión completa de un ticket que se rebajó.
 *
 * Las cifras las da el SERVIDOR (`venta.cotizar_cita`), con la misma función que el
 * cobro: la frase dice lo que el cobro va a hacer, no una cuenta del navegador.
 *
 * ── Por encima del tope ──────────────────────────────────────────────────
 * El servidor dice si el descuento pasa del tope del puesto de quien cobra (F-205), y
 * aquí se dice ANTES: APLICAR se apaga y el aviso explica que lo aplica quien lo
 * autoriza, entrando con su PIN. Cobrarlo igual daría un 403 con la clienta enfrente.
 */

export interface CotizacionDelDescuento {
  readonly listaCentavos: string;
  readonly totalCentavos: string;
  readonly descuentoCentavos: string;
  readonly descuentoPasaDelTope: { readonly topeCentavos: string; readonly topeBp: number } | null;
  readonly comisiones: readonly {
    readonly profesionalId: string;
    readonly sinDescuentoCentavos: string;
    readonly conDescuentoCentavos: string;
  }[];
}

export interface DescuentoDelCobroProps {
  readonly citaId: string;
  /** El descuento aplicado, en puntos base. 0 es sin descuento. */
  readonly aplicadoBp: number;
  readonly descuentoAplicadoCentavos: number;
  readonly nombreDe: (id: string) => string;
  readonly alAplicar: (puntosBase: number) => void;
  /** Para las pruebas: la cotización del descuento propuesto, sin red. */
  readonly cotizar?: (puntosBase: number, signal?: AbortSignal) => Promise<CotizacionDelDescuento>;
}

/** «10» son 1000 puntos base. Sólo enteros del 1 al 100: el mostrador no descuenta 12.5 %. */
export function puntosBaseDe(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const porcentaje = Number(texto.trim());
  return porcentaje >= 1 && porcentaje <= 100 ? porcentaje * 100 : null;
}

function cotizarEnElServidor(citaId: string) {
  return (puntosBase: number, signal?: AbortSignal) =>
    invocarComando<CotizacionDelDescuento>(
      '/api/venta/cotizar-cita',
      { citaId, descuentoBp: puntosBase },
      signal === undefined ? {} : { signal },
    );
}

export function DescuentoDelCobro({
  citaId,
  aplicadoBp,
  descuentoAplicadoCentavos,
  nombreDe,
  alAplicar,
  cotizar,
}: DescuentoDelCobroProps) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [vista, setVista] = useState<CotizacionDelDescuento | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const puntosBase = puntosBaseDe(texto);

  useEffect(() => {
    if (!abierto || puntosBase === null) return;
    const control = new AbortController();
    const pedir = cotizar ?? cotizarEnElServidor(citaId);
    pedir(puntosBase, control.signal)
      .then((cotizada) => {
        if (!control.signal.aborted) setVista(cotizada);
      })
      .catch((error: unknown) => {
        if (control.signal.aborted) return;
        setFallo(
          error instanceof ErrorApi ? error.error.mensaje : 'No se pudo calcular el descuento.',
        );
      });
    return () => {
      control.abort();
    };
  }, [abierto, puntosBase, citaId, cotizar]);

  function cerrar(): void {
    setAbierto(false);
    setTexto('');
    setVista(null);
    setFallo(null);
  }

  if (!abierto) {
    return aplicadoBp === 0 ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          setAbierto(true);
        }}
      >
        <BadgePercent aria-hidden="true" />
        Descuento
      </Button>
    ) : (
      <p className="flex flex-wrap items-baseline justify-between gap-(--espacio-2) text-sm">
        <span>
          Descuento {aplicadoBp / 100} % ·{' '}
          <Dinero centavos={-descuentoAplicadoCentavos} tamano="sm" conSigno />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            alAplicar(0);
          }}
        >
          Quitar
        </Button>
      </p>
    );
  }

  const comision = vista?.comisiones ?? [];
  const pasado = vista?.descuentoPasaDelTope ?? null;
  const vistaVigente = vista !== null && puntosBase !== null;

  return (
    <Superficie nivel={0} relleno={3} radio="md" className="flex flex-col gap-(--espacio-3)">
      <span className="grid grid-cols-[auto_6rem_auto] items-center gap-(--espacio-2)">
        <Label htmlFor="descuento-porcentaje">Descuento</Label>
        <Input
          id="descuento-porcentaje"
          inputMode="numeric"
          autoComplete="off"
          placeholder="10"
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value);
            setVista(null);
            setFallo(null);
          }}
        />
        <span className="text-sm text-texto-sutil">%</span>
      </span>

      {fallo !== null ? (
        <Aviso tono="peligro" titulo={fallo} />
      ) : puntosBase === null ? (
        <p className="text-sm text-texto-sutil">Un porcentaje entero, del 1 al 100.</p>
      ) : !vistaVigente ? (
        <div
          role="status"
          aria-label="Calculando el descuento"
          className="flex flex-col gap-(--espacio-2)"
        >
          <Esqueleto className="h-4 w-3/4" />
          <Esqueleto className="h-4 w-2/3" />
        </div>
      ) : (
        <div className="flex flex-col gap-(--espacio-1) text-sm">
          <p>
            El ticket baja de <Dinero centavos={Number(vista.listaCentavos)} tamano="sm" /> a{' '}
            <Dinero centavos={Number(vista.totalCentavos)} tamano="sm" />
          </p>
          {comision.map((c) => {
            const sin = Number(c.sinDescuentoCentavos);
            const con = Number(c.conDescuentoCentavos);
            return (
              <p key={c.profesionalId}>
                La comisión de {nombreDe(c.profesionalId)} baja de{' '}
                <Dinero centavos={sin} tamano="sm" /> a <Dinero centavos={con} tamano="sm" /> (
                <Dinero centavos={con - sin} tamano="sm" conSigno />)
              </p>
            );
          })}
          {pasado !== null && (
            <Aviso
              tono="atencion"
              titulo={
                <>
                  Pasa de tu tope: {pasado.topeBp / 100} % o{' '}
                  <Dinero centavos={Number(pasado.topeCentavos)} tamano="sm" />
                </>
              }
            >
              Lo aplica quien lo autoriza: que entre con su PIN y cobre desde su sesión.
            </Aviso>
          )}
        </div>
      )}

      <div className="flex justify-end gap-(--espacio-2)">
        <Button type="button" variant="ghost" onClick={cerrar}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!vistaVigente || pasado !== null}
          onClick={() => {
            if (puntosBase === null) return;
            alAplicar(puntosBase);
            cerrar();
          }}
        >
          Aplicar
        </Button>
      </div>
    </Superficie>
  );
}
