'use client';

import { useEffect, useRef, useState } from 'react';

import { aCentavos, CLASE_IMPORTE, pesos } from './dinero';
import type { Cotizacion, ResultadoCobro } from './tipos';
import { ALTO_ACCION, ALTO_CONTROL } from './controles';

/**
 * El cobro (F1.1-A-09, pantalla).
 *
 * El único importe que el cajero teclea es **cuánto billete puso el cliente**.
 * Ni el total ni el cambio se escriben: el total lo manda el servidor y el
 * cambio lo devuelve él al confirmar. Esta pantalla muestra un cambio estimado
 * mientras se teclea, y lo dice —«estimado»— porque el bueno es el del ticket.
 *
 * Los billetes de acceso rápido son los de circulación real en México. Cubren
 * la mayoría de los cobros sin teclear una cifra.
 */

const BILLETES = [5000, 10_000, 20_000, 50_000, 100_000] as const;

interface Props {
  readonly cotizacion: Cotizacion;
  readonly cobrando: boolean;
  readonly error: string | null;
  readonly onCerrar: () => void;
  readonly onCobrar: (pagos: readonly unknown[]) => Promise<ResultadoCobro | null>;
}

export function DialogoCobro({ cotizacion, cobrando, error, onCerrar, onCobrar }: Props) {
  const [metodo, setMetodo] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [recibido, setRecibido] = useState('');
  const dialogo = useRef<HTMLDivElement>(null);
  const primerControl = useRef<HTMLButtonElement>(null);

  const total = BigInt(cotizacion.totalCentavos);
  const puesto = aCentavos(recibido);
  const alcanza =
    metodo !== 'efectivo' || recibido === '' || (puesto !== null && BigInt(puesto) >= total);
  const cambio = metodo === 'efectivo' && puesto !== null ? BigInt(puesto) - total : 0n;

  useEffect(() => {
    primerControl.current?.focus();
  }, []);

  // Trampa de foco: mientras el diálogo está abierto, el tabulador no puede
  // llevar a nadie a la pantalla de atrás. Sin esto, el cajero tabula, pulsa
  // Enter y agrega un producto creyendo que estaba cobrando.
  function alTeclear(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      onCerrar();
      return;
    }
    if (evento.key !== 'Tab') return;
    const focos = dialogo.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled])',
    );
    if (focos === undefined || focos.length === 0) return;
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    if (primero === undefined || ultimo === undefined) return;
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  function confirmar() {
    if (cobrando || !alcanza) return;
    const pago: Record<string, unknown> = {
      metodo,
      montoCentavos: Number(total),
      ...(metodo === 'efectivo' && puesto !== null ? { recibidoCentavos: puesto } : {}),
    };
    void onCobrar([pago]);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-velo/60 p-0 sm:items-center sm:p-6"
      onKeyDown={alTeclear}
      role="presentation"
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cobro"
        className="w-full max-w-lg rounded-t-lg border border-borde bg-superficie shadow-2 sm:rounded-lg"
      >
        <header className="border-b border-borde px-6 py-4">
          <h2 id="titulo-cobro" className="text-sm font-medium text-texto-sutil">
            Total a cobrar
          </h2>
          <p className={`mt-1 text-5xl font-semibold text-texto ${CLASE_IMPORTE}`}>
            {pesos(cotizacion.totalCentavos)}
          </p>
        </header>

        <div className="space-y-5 px-6 py-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-texto-sutil">Forma de pago</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['efectivo', 'tarjeta', 'transferencia'] as const).map((m, i) => (
                <button
                  key={m}
                  ref={i === 0 ? primerControl : undefined}
                  type="button"
                  aria-pressed={metodo === m}
                  onClick={() => {
                    setMetodo(m);
                  }}
                  className={`${ALTO_CONTROL} rounded-md border border-borde text-sm font-medium capitalize text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none aria-pressed:border-primario aria-pressed:bg-primario aria-pressed:text-primario-texto`}
                >
                  {m}
                </button>
              ))}
            </div>
          </fieldset>

          {metodo === 'efectivo' && (
            <div className="space-y-2">
              <label htmlFor="recibido" className="block text-sm font-medium text-texto-sutil">
                ¿Con cuánto paga?
              </label>
              <input
                id="recibido"
                inputMode="decimal"
                autoComplete="off"
                value={recibido}
                onChange={(e) => {
                  setRecibido(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmar();
                  }
                }}
                placeholder="Exacto"
                aria-invalid={!alcanza}
                className={`${ALTO_ACCION} w-full rounded-md border bg-fondo px-4 text-2xl text-texto ${CLASE_IMPORTE} focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none ${alcanza ? 'border-borde' : 'border-peligro'}`}
              />

              <div className="flex flex-wrap gap-2 pt-1">
                {BILLETES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setRecibido(String(b / 100));
                    }}
                    className={`${ALTO_CONTROL} rounded-md border border-borde px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none ${CLASE_IMPORTE}`}
                  >
                    {pesos(String(b))}
                  </button>
                ))}
              </div>

              {!alcanza && (
                <p role="alert" className="text-sm font-medium text-peligro">
                  Ese efectivo no alcanza para el total.
                </p>
              )}

              {alcanza && recibido !== '' && (
                <p className="flex items-baseline justify-between border-t border-borde pt-3">
                  <span className="text-sm text-texto-sutil">Cambio estimado</span>
                  <span className={`text-2xl font-semibold text-exito ${CLASE_IMPORTE}`}>
                    {pesos(cambio.toString())}
                  </span>
                </p>
              )}
            </div>
          )}

          {error !== null && (
            <p
              role="alert"
              className="rounded-md bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex gap-3 border-t border-borde px-6 py-4">
          <button
            type="button"
            onClick={onCerrar}
            className={`${ALTO_ACCION} flex-1 rounded-md border border-borde font-medium text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
          >
            Cancelar <kbd className="ml-1 text-xs text-texto-tenue">Esc</kbd>
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={cobrando || !alcanza}
            className={`${ALTO_ACCION} flex-[2] rounded-md bg-exito text-lg font-semibold text-exito-texto transition-colors hover:bg-exito/90 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {cobrando ? 'Cobrando…' : 'Cobrar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
