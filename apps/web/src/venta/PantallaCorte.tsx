'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ErrorApi, invocarComando, nuevaClave } from '@/cliente/api';

import { ALTO_ACCION, ALTO_CONTROL, ALTO_DESTACADO } from './controles';
import { aCentavos, CLASE_IMPORTE, pesos } from './dinero';
import type { EstadoCaja, ResultadoCorte } from './tipos';

/**
 * Corte de caja (F1.1-C-10).
 *
 * **El conteo es a ciegas.** La pantalla enseña el fondo, cuántas ventas hubo y
 * los gastos y retiros del turno; no enseña cuánto DEBERÍA haber en el cajón
 * hasta que el cajero dice cuánto hay. Si el esperado se viera antes, nadie
 * contaría: se teclearía esa cifra y el corte dejaría de servir para lo único
 * que sirve, que es encontrar un faltante.
 *
 * El esperado y la diferencia los calcula el servidor dentro de la transacción
 * del cierre, así que tampoco existe la ventana en la que la pantalla enseñe un
 * número que ya cambió porque entró otra venta.
 */

export function PantallaCorte() {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const [corte, setCorte] = useState<ResultadoCorte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [clave] = useState(nuevaClave);

  useEffect(() => {
    const control = new AbortController();
    invocarComando<EstadoCaja>('/api/caja/estado', {}, { signal: control.signal })
      .then(setEstado)
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return;
        if (fallo instanceof ErrorApi && fallo.error.codigo === 'NO_AUTENTICADO') {
          // `router.push` conserva el estado del cliente, y aquí eso es lo que NO se
          // quiere: la sesión dejó de existir y hay que tirar todo lo que se leyó con
          // ella. Una recarga completa es la intención, no un descuido.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign('/login-pos');
          return;
        }
        setError(fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudo leer la caja.');
      });
    return () => {
      control.abort();
    };
  }, []);

  const centavos = aCentavos(contado);

  async function cerrar() {
    if (centavos === null || cerrando) return;
    setCerrando(true);
    setError(null);
    try {
      setCorte(
        await invocarComando<ResultadoCorte>(
          '/api/caja/cerrar',
          {
            efectivoContadoCentavos: centavos,
            ...(notas.trim() === '' ? {} : { notas: notas.trim() }),
          },
          { idempotencyKey: clave },
        ),
      );
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudo cerrar la caja.');
    } finally {
      setCerrando(false);
    }
  }

  if (corte !== null) {
    return (
      <Resumen
        corte={corte}
        onSalir={() => {
          router.push('/venta');
        }}
      />
    );
  }

  if (estado !== null && !estado.abierta) {
    return (
      <Marco>
        <h1 className="text-2xl font-semibold text-texto">No hay caja abierta</h1>
        <p className="text-texto-sutil">
          No hay turno que cerrar en esta terminal. Ábrela desde la pantalla de venta cuando
          empieces a cobrar.
        </p>
        <a
          href="/venta"
          className={`${ALTO_ACCION} inline-flex items-center justify-center rounded-md bg-primario px-6 font-semibold text-primario-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
        >
          Volver a vender
        </a>
      </Marco>
    );
  }

  return (
    <Marco>
      <header>
        <h1 className="text-2xl font-semibold text-texto">Corte de caja</h1>
        <p className="mt-1 text-texto-sutil">
          Cuenta el dinero del cajón y escribe cuánto hay. El sistema te dirá si cuadra.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde">
        <Dato termino="Fondo inicial" valor={pesos(estado?.fondoInicialCentavos ?? '0')} />
        <Dato termino="Ventas del turno" valor={pesos(estado?.ventasCentavos ?? '0')} />
        <Dato
          termino="Número de ventas"
          valor={String(estado?.numeroVentas ?? 0)}
          nota="incluye tarjeta y transferencia"
        />
        <Dato
          termino="Movimientos manuales"
          valor={String(estado?.movimientos.length ?? 0)}
          nota="gastos, retiros y depósitos"
        />
      </dl>

      {estado !== null && estado.movimientos.length > 0 && (
        <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie text-sm">
          {estado.movimientos.map((m, i) => (
            <li
              key={`${m.registradoEn}-${String(i)}`}
              className="flex items-baseline gap-3 px-4 py-2"
            >
              <span className="capitalize text-texto">{m.tipo}</span>
              {m.motivo !== null && <span className="truncate text-texto-tenue">{m.motivo}</span>}
              <span className={`ml-auto ${CLASE_IMPORTE} text-texto-sutil`}>
                {pesos(m.montoCentavos)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void cerrar();
        }}
      >
        <label htmlFor="contado" className="block text-sm font-medium text-texto-sutil">
          ¿Cuánto efectivo hay en el cajón?
        </label>
        <input
          id="contado"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          value={contado}
          onChange={(e) => {
            setContado(e.target.value);
          }}
          placeholder="0.00"
          aria-invalid={centavos === null && contado !== ''}
          className={`${ALTO_DESTACADO} w-full rounded-md border bg-superficie px-4 text-3xl text-texto ${CLASE_IMPORTE} focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none ${
            centavos === null && contado !== '' ? 'border-peligro' : 'border-borde'
          }`}
        />

        <label htmlFor="notas" className="block text-sm font-medium text-texto-sutil">
          Notas del turno <span className="font-normal text-texto-tenue">(opcional)</span>
        </label>
        <input
          id="notas"
          value={notas}
          maxLength={500}
          onChange={(e) => {
            setNotas(e.target.value);
          }}
          placeholder="Se pagó al de la garrafa con dinero de la caja"
          className={`${ALTO_CONTROL} w-full rounded-md border border-borde bg-superficie px-4 text-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
        />

        {error !== null && (
          <p
            role="alert"
            className="rounded-md bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={centavos === null || cerrando || estado === null}
          className={`${ALTO_DESTACADO} w-full rounded-md bg-primario text-lg font-semibold text-primario-texto transition-colors hover:bg-primario/90 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {cerrando ? 'Cerrando…' : 'Cerrar caja'}
        </button>
      </form>
    </Marco>
  );
}

/**
 * El resultado del corte.
 *
 * La diferencia se dice con palabras además de con signo y color: «faltan» y
 * «sobran» no se confunden, un menos delante de una cifra sí — y el color solo
 * no comunica nada a quien no lo distingue (WCAG 1.4.1).
 */
function Resumen({
  corte,
  onSalir,
}: {
  readonly corte: ResultadoCorte;
  readonly onSalir: () => void;
}) {
  const diferencia = BigInt(corte.diferenciaCentavos);
  const cuadra = diferencia === 0n;
  const falta = diferencia < 0n;

  return (
    <Marco>
      <header>
        <p className="text-sm font-medium text-texto-tenue">Turno cerrado</p>
        <h1
          className={`mt-1 text-3xl font-semibold ${cuadra ? 'text-exito' : falta ? 'text-peligro' : 'text-advertencia'}`}
        >
          {cuadra ? 'La caja cuadra' : falta ? 'Falta dinero' : 'Sobra dinero'}
        </h1>
        {!cuadra && (
          <p className={`mt-1 text-2xl font-semibold text-texto ${CLASE_IMPORTE}`}>
            {pesos((falta ? -diferencia : diferencia).toString())}
          </p>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-borde bg-borde">
        <Dato termino="Fondo inicial" valor={pesos(corte.fondoInicialCentavos)} />
        <Dato termino="Ventas del turno" valor={pesos(corte.ventasCentavos)} />
        <Dato termino="Efectivo esperado" valor={pesos(corte.efectivoEsperadoCentavos)} />
        <Dato termino="Efectivo contado" valor={pesos(corte.efectivoContadoCentavos)} />
      </dl>

      <p className="text-sm text-texto-sutil">
        {corte.numeroVentas === 0
          ? 'No se cobró ninguna venta en este turno.'
          : `${String(corte.numeroVentas)} venta(s) cobradas.`}{' '}
        El esperado es la suma del fondo, las ventas en efectivo y los movimientos manuales — la
        tarjeta y la transferencia no ponen billetes en el cajón.
      </p>

      <button
        type="button"
        onClick={onSalir}
        className={`${ALTO_ACCION} w-full rounded-md bg-primario font-semibold text-primario-texto focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
      >
        Terminar
      </button>
    </Marco>
  );
}

function Marco({ children }: { readonly children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-6 py-12">
      {children}
    </main>
  );
}

function Dato({
  termino,
  valor,
  nota,
}: {
  readonly termino: string;
  readonly valor: string;
  readonly nota?: string;
}) {
  return (
    <div className="bg-superficie px-4 py-3">
      <dt className="text-xs text-texto-tenue">{termino}</dt>
      <dd className={`mt-0.5 text-lg font-semibold text-texto ${CLASE_IMPORTE}`}>{valor}</dd>
      {nota !== undefined && <p className="text-xs text-texto-tenue">{nota}</p>}
    </div>
  );
}
