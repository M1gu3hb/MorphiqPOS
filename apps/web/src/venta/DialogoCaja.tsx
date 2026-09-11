'use client';

import { useState } from 'react';

import { ErrorApi, invocarComando } from '@/cliente/api';

import { aCentavos, CLASE_IMPORTE, pesos } from './dinero';
import { ALTO_ACCION, ALTO_CONTROL } from './controles';

/**
 * Abrir la caja (F1.1-A-08, pantalla).
 *
 * Se pide una sola cifra: el fondo con el que arranca el turno. Ese fondo entra
 * como movimiento de apertura, así que el corte del cierre es una suma de
 * movimientos y no una fórmula con ramas que alguien copia mal en un reporte.
 */

interface Props {
  readonly onAbierta: () => void;
  readonly onCerrar: () => void;
}

export function DialogoCaja({ onAbierta, onCerrar }: Props) {
  const [fondo, setFondo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const centavos = aCentavos(fondo === '' ? '0' : fondo);

  async function abrir() {
    if (centavos === null || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await invocarComando('/api/caja/abrir', { fondoInicialCentavos: centavos });
      onAbierta();
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudo abrir la caja.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-caja"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar();
      }}
    >
      <form
        className="w-full max-w-sm rounded-lg border border-borde bg-superficie shadow-2"
        onSubmit={(e) => {
          e.preventDefault();
          void abrir();
        }}
      >
        <header className="border-b border-borde px-6 py-4">
          <h2 id="titulo-caja" className="text-xl font-semibold text-texto">
            Abre tu caja
          </h2>
          <p className="mt-1 text-sm text-texto-sutil">
            ¿Con cuánto dinero arranca el cajón? Sin esto no se puede cobrar en efectivo.
          </p>
        </header>

        <div className="space-y-3 px-6 py-5">
          <label htmlFor="fondo" className="block text-sm font-medium text-texto-sutil">
            Fondo inicial
          </label>
          <input
            id="fondo"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            value={fondo}
            onChange={(e) => {
              setFondo(e.target.value);
            }}
            placeholder="0.00"
            aria-invalid={centavos === null}
            className={`${ALTO_ACCION} w-full rounded-md border bg-fondo px-4 text-2xl text-texto ${CLASE_IMPORTE} focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none ${centavos === null ? 'border-peligro' : 'border-borde'}`}
          />
          {centavos !== null && fondo !== '' && (
            <p className="text-sm text-texto-tenue">Se registrará {pesos(String(centavos))}.</p>
          )}
          {error !== null && (
            <p role="alert" className="text-sm font-medium text-peligro">
              {error}
            </p>
          )}
        </div>

        <footer className="flex gap-3 border-t border-borde px-6 py-4">
          <button
            type="button"
            onClick={onCerrar}
            className={`${ALTO_CONTROL} flex-1 rounded-md border border-borde font-medium text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
          >
            Ahora no
          </button>
          <button
            type="submit"
            disabled={centavos === null || enviando}
            className={`${ALTO_CONTROL} flex-1 rounded-md bg-primario font-semibold text-primario-texto transition-colors hover:bg-primario/90 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:opacity-50`}
          >
            {enviando ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </footer>
      </form>
    </div>
  );
}
