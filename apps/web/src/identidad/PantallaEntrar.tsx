'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ErrorApi, invocarComando } from '@/cliente/api';
import type { Empleado } from '@/venta/tipos';
import { ALTO_ACCION, ALTO_CONTROL } from '@/venta/controles';

/**
 * Entrada con PIN (F1.1-A-03, pantalla).
 *
 * El PIN se teclea en un campo `password` de 4 a 8 dígitos y viaja una sola
 * vez. **Nunca se guarda**: ni en estado que sobreviva al envío, ni en
 * `localStorage`, ni en la URL. La sesión vuelve en una cookie `HttpOnly` que
 * este código no puede leer, y eso es a propósito.
 *
 * El teclado numérico en pantalla existe porque la caja suele ser una tablet
 * sin teclado físico, pero el campo acepta escritura directa: quien tenga
 * teclado no necesita tocar la pantalla ni una vez.
 */

const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function PantallaEntrar() {
  const router = useRouter();
  const [empleados, setEmpleados] = useState<readonly Empleado[] | null>(null);
  const [empleoId, setEmpleoId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campoPin = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/auth/empleados', { credentials: 'same-origin' })
      .then((r) => r.json() as Promise<{ datos?: { empleados?: Empleado[] } }>)
      .then((cuerpo) => {
        if (vivo) setEmpleados(cuerpo.datos?.empleados ?? []);
      })
      .catch(() => {
        if (vivo) setEmpleados([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const entrar = useCallback(async () => {
    if (empleoId === null || pin.length < 4 || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await invocarComando('/api/auth/entrar', { empleoId, pin });
      setPin('');
      router.push('/venta');
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudo entrar.');
      setPin('');
      campoPin.current?.focus();
    } finally {
      setEnviando(false);
    }
  }, [empleoId, enviando, pin, router]);

  if (empleados !== null && empleados.length === 0) {
    return <TerminalSinEnrolar />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header>
        <p className="text-sm font-medium tracking-wide text-texto-tenue">MorphiqPOS</p>
        <h1 className="mt-1 text-3xl font-semibold text-texto">Entra a tu turno</h1>
      </header>

      <div className="space-y-2">
        <label htmlFor="empleado" className="block text-sm font-medium text-texto-sutil">
          ¿Quién eres?
        </label>
        <select
          id="empleado"
          value={empleoId ?? ''}
          onChange={(e) => {
            setEmpleoId(e.target.value === '' ? null : e.target.value);
            campoPin.current?.focus();
          }}
          className={`${ALTO_CONTROL} w-full rounded-md border border-borde bg-superficie px-3 text-base text-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
        >
          <option value="">Selecciona tu nombre…</option>
          {(empleados ?? []).map((e) => (
            <option key={e.empleoId} value={e.empleoId}>
              {e.nombre} · {e.rol}
            </option>
          ))}
        </select>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void entrar();
        }}
      >
        <label htmlFor="pin" className="block text-sm font-medium text-texto-sutil">
          Tu PIN
        </label>
        <input
          ref={campoPin}
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
          }}
          aria-describedby={error === null ? undefined : 'error-pin'}
          aria-invalid={error !== null}
          className={`${ALTO_ACCION} w-full rounded-md border border-borde bg-superficie px-4 text-center text-3xl tracking-[0.5em] text-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
        />

        {error !== null && (
          <p id="error-pin" role="alert" className="text-sm font-medium text-peligro">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 pt-2">
          {DIGITOS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setPin((p) => (p.length < 8 ? p + d : p));
              }}
              className={`${ALTO_ACCION} rounded-md border border-borde bg-superficie text-xl font-medium text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none active:scale-[0.98]`}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPin((p) => p.slice(0, -1));
            }}
            className={`${ALTO_ACCION} rounded-md border border-borde bg-superficie text-sm font-medium text-texto-sutil transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
          >
            Borrar
          </button>
          <button
            type="submit"
            disabled={empleoId === null || pin.length < 4 || enviando}
            className={`col-span-2 ${ALTO_ACCION} rounded-md bg-primario text-base font-semibold text-primario-texto transition-colors hover:bg-primario/90 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </main>
  );
}

/**
 * Sin terminal enrolada no hay a quién listar, y decirlo así evita el peor
 * estado vacío posible: un desplegable vacío que parece un error del sistema.
 */
function TerminalSinEnrolar() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold text-texto">Esta terminal no está dada de alta</h1>
      <p className="text-texto-sutil">
        Pide a un encargado el código de seis dígitos y enrólala una sola vez. Después entrarás
        siempre con tu PIN.
      </p>
      <a
        href="/enrolar"
        className={`inline-flex ${ALTO_CONTROL} items-center justify-center rounded-md bg-primario px-6 font-semibold text-primario-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
      >
        Enrolar esta terminal
      </a>
    </main>
  );
}
