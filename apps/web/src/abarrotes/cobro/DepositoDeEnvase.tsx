'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, Dinero } from '@morphiqpos/ui/sistema';
import { Beer } from 'lucide-react';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * EL CASCO (F-256, bloque D de la 2.4).
 *
 * «Cerveza (con casco)» es el pico de las siete de la noche. El depósito del envase
 * ENTRA al cajón y NO es venta: es dinero del cliente que vuelve cuando trae el casco
 * (`abarrotes/02-DINERO-Y-CAJA §1`, «Devolución de casco · Cancela el pasivo»). Cobrarlo
 * como venta infla el día y el margen; no registrarlo hace que el cajón sobre cada noche y
 * que, cuando el cliente trae el casco, salgan diez pesos que nadie sabe de dónde. El
 * backend lo llevaba en su libro de pasivos (`envase.mover_deposito`) y la caja no tenía
 * botón.
 */

/** Lo que vale el casco de un retornable de 1.2 L en una tienda de barrio. */
const DEPOSITO_POR_CASCO = 1_000;

/** El mismo tope que `entradaDepositoEnvase` (`cantidad ≤ 500`). */
const MAX_CASCOS = 500;

export interface EnvaseMovido {
  readonly devolucion: boolean;
  readonly cantidad: number;
  readonly montoCentavos: number;
}

export function DepositoDeEnvase({ onListo }: { readonly onListo: (hecho: EnvaseMovido) => void }) {
  const [devolucion, setDevolucion] = useState(false);
  const [cantidad, setCantidad] = useState('1');
  const [porCasco, setPorCasco] = useState<number | null>(DEPOSITO_POR_CASCO);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const piezas = /^\d{1,3}$/.test(cantidad.trim()) ? Number(cantidad.trim()) : 0;
  const monto = piezas * (porCasco ?? 0);

  async function registrar(): Promise<void> {
    if (piezas < 1 || monto < 1) {
      setFallo('Pon cuántos cascos y cuánto vale cada uno.');
      return;
    }
    if (piezas > MAX_CASCOS) {
      setFallo(`De una vez caben hasta ${String(MAX_CASCOS)} cascos.`);
      return;
    }
    setEnviando(true);
    setFallo(null);
    try {
      await invocarComando('/api/envase/deposito', {
        montoCentavos: monto,
        cantidad: piezas,
        devolucion,
      });
      onListo({ devolucion, cantidad: piezas, montoCentavos: monto });
    } catch (error: unknown) {
      setFallo(error instanceof ErrorApi ? error.message : 'No se pudo registrar el casco.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-(--espacio-3)"
      onSubmit={(evento) => {
        evento.preventDefault();
        void registrar();
      }}
    >
      <div
        role="group"
        aria-label="Qué pasa con el casco"
        className="grid grid-cols-2 gap-(--espacio-2)"
      >
        {[false, true].map((esDevolucion) => (
          <Button
            key={String(esDevolucion)}
            type="button"
            size="sm"
            variant={devolucion === esDevolucion ? 'default' : 'outline'}
            aria-pressed={devolucion === esDevolucion}
            onClick={() => {
              setDevolucion(esDevolucion);
            }}
          >
            {esDevolucion ? 'Trae el casco' : 'Se lleva el casco'}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="casco-cantidad">Cuántos</Label>
          <Input
            id="casco-cantidad"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={cantidad}
            onChange={(evento) => {
              setCantidad(evento.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="casco-precio">Por casco</Label>
          <CampoDeDinero id="casco-precio" centavos={porCasco} alCambiar={setPorCasco} />
        </div>
      </div>
      <p className="flex items-baseline justify-between gap-(--espacio-2)" aria-live="polite">
        <span className="text-sm text-texto-sutil">
          {devolucion ? 'Sale del cajón' : 'Entra al cajón'} (no es venta)
        </span>
        <Dinero centavos={monto} tamano="lg" />
      </p>
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
      <Button type="submit" disabled={enviando} cargando={enviando}>
        <Beer aria-hidden="true" />
        {devolucion ? 'Devolver el depósito' : 'Cobrar el depósito'}
      </Button>
    </form>
  );
}
