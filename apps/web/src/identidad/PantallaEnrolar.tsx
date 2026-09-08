'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ErrorApi, invocarComando } from '@/cliente/api';
import { ALTO_ACCION, ALTO_DESTACADO } from '@/venta/controles';

/**
 * Enrolamiento de la terminal (F1.1-A-02, pantalla).
 *
 * Se hace UNA vez por dispositivo. El código de seis dígitos caduca a los
 * quince minutos y se quema al usarse: sirve para una terminal y para una sola.
 * A cambio el dispositivo recibe una cookie de un año, y a partir de ahí la
 * terminal es quien identifica a la organización — nunca el cliente.
 */
export function PantallaEnrolar() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (codigo.length !== 6 || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await invocarComando('/api/auth/enrolar', { codigo });
      router.push('/entrar');
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudo enrolar.');
      setCodigo('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header>
        <p className="text-sm font-medium tracking-wide text-texto-tenue">MorphiqPOS</p>
        <h1 className="mt-1 text-3xl font-semibold text-texto">Da de alta esta caja</h1>
        <p className="mt-2 text-texto-sutil">
          Escribe el código de seis dígitos que te dio el encargado. Sólo hace falta la primera vez.
        </p>
      </header>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <label htmlFor="codigo" className="block text-sm font-medium text-texto-sutil">
          Código de enrolamiento
        </label>
        <input
          id="codigo"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6));
          }}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : 'error-codigo'}
          className={`${ALTO_DESTACADO} w-full rounded-md border border-borde bg-superficie px-4 text-center text-4xl tracking-[0.3em] tabular-nums text-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
        />

        {error !== null && (
          <p id="error-codigo" role="alert" className="text-sm font-medium text-peligro">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={codigo.length !== 6 || enviando}
          className={`${ALTO_ACCION} w-full rounded-md bg-primario text-base font-semibold text-primario-texto transition-colors hover:bg-primario/90 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {enviando ? 'Dando de alta…' : 'Dar de alta'}
        </button>
      </form>
    </main>
  );
}
