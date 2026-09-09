'use client';

import { KeyRound, Monitor, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { ErrorApi, ejecutarApi, obtenerApi } from '../../../src/cliente/api';
import { ALTO_CONTROL } from '@/venta/controles';

/**
 * Accesos: quién entra y desde dónde (F1.1-C-05 y C-06).
 *
 * Es la pantalla que faltaba para que `db:bootstrap` se ejecute una sola vez en
 * la vida del negocio. Dar de alta a un cajero, desbloquear a quien se equivocó
 * cinco veces y mover la caja a otra tableta se hacen aquí.
 *
 * Los dos avisos que la pantalla da en voz alta, porque sorprenden:
 *   · el PIN **no se puede consultar**, sólo reemplazar;
 *   · pedir un código nuevo **desconecta la tableta actual**.
 */

interface Empleado {
  readonly empleoId: string;
  readonly nombre: string;
  readonly rol: string;
  readonly tienePin: boolean;
  readonly bloqueadaHasta: string | null;
  readonly intentosFallidos: number;
}

interface Terminal {
  readonly terminalId: string;
  readonly nombre: string;
  readonly sucursal: string;
  readonly enrolada: boolean;
  readonly ultimaActividad: string | null;
  readonly codigoVigente: boolean;
}

interface AccesosApi {
  readonly empleados: readonly Empleado[];
  readonly terminales: readonly Terminal[];
  readonly rol: string;
}

const PUEDE_ADMINISTRAR = new Set(['dueno', 'administrador']);

export function AccesosPantalla() {
  const [datos, setDatos] = useState<AccesosApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<{ terminal: string; codigo: string } | null>(null);

  /** Recarga tras una acción del usuario. Aquí sí hay un evento detrás. */
  const cargar = useCallback(async () => {
    try {
      setDatos(await obtenerApi<AccesosApi>('/api/identidad/accesos'));
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudieron cargar los accesos.',
      );
    }
  }, []);

  // La carga inicial no llama a `cargar` sino que resuelve la promesa aquí: el
  // estado se escribe DESPUÉS del await, no en el cuerpo del efecto. Y es
  // abortable, para no dejar viva una petición de una pantalla que ya se cerró.
  useEffect(() => {
    const control = new AbortController();
    obtenerApi<AccesosApi>('/api/identidad/accesos', control.signal)
      .then(setDatos)
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return;
        setError(
          fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudieron cargar los accesos.',
        );
      });
    return () => {
      control.abort();
    };
  }, []);

  const administra = datos !== null && PUEDE_ADMINISTRAR.has(datos.rol);

  async function ponerPin(empleoId: string, nombre: string) {
    const pin = window.prompt(`PIN nuevo para ${nombre} (4 a 8 dígitos):`);
    if (pin === null) return;
    if (!/^\d{4,8}$/.test(pin)) {
      setError('El PIN son de 4 a 8 dígitos, sin letras.');
      return;
    }
    setError(null);
    try {
      await ejecutarApi('/api/identidad/pin', { empleado: empleoId, pin });
      await cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudo guardar el PIN.');
    }
  }

  async function pedirCodigo(terminalId: string, nombre: string, enrolada: boolean) {
    if (
      enrolada &&
      !window.confirm(
        `“${nombre}” ya está en uso en un dispositivo.\n\n` +
          'Generar un código nuevo lo desconecta: esa tableta tendrá que volver a enrolarse. ¿Seguir?',
      )
    ) {
      return;
    }
    setError(null);
    try {
      const r = await ejecutarApi<{ codigo: string; terminal: string }>('/api/identidad/codigo', {
        terminal: terminalId,
      });
      setCodigo({ terminal: r.terminal, codigo: r.codigo });
      await cargar();
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudo generar el código.');
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-texto">Accesos</h1>
        <p className="mt-1 max-w-2xl text-texto-sutil">
          Quién puede entrar a cobrar y desde qué cajas. El PIN no se puede consultar — sólo
          reemplazar.
        </p>
      </header>

      {error !== null && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro"
        >
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {codigo !== null && (
        <CodigoReciente
          terminal={codigo.terminal}
          codigo={codigo.codigo}
          onCerrar={() => {
            setCodigo(null);
          }}
        />
      )}

      <section aria-labelledby="titulo-empleados" className="space-y-3">
        <h2 id="titulo-empleados" className="flex items-center gap-2 font-medium text-texto">
          <KeyRound aria-hidden="true" className="size-4 text-texto-sutil" />
          Empleados
        </h2>

        {datos === null ? (
          <Cargando />
        ) : (
          <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie">
            {datos.empleados.map((e) => (
              <li
                key={e.empleoId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-texto">{e.nombre}</span>
                  <span className="text-xs capitalize text-texto-tenue">{e.rol}</span>
                </span>

                <EstadoDelPin empleado={e} />

                {administra && (
                  <button
                    type="button"
                    onClick={() => {
                      void ponerPin(e.empleoId, e.nombre);
                    }}
                    className={`${ALTO_CONTROL} shrink-0 rounded-md border border-borde px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
                  >
                    {e.tienePin ? 'Cambiar PIN' : 'Poner PIN'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-terminales" className="space-y-3">
        <h2 id="titulo-terminales" className="flex items-center gap-2 font-medium text-texto">
          <Monitor aria-hidden="true" className="size-4 text-texto-sutil" />
          Cajas
        </h2>

        {datos === null ? (
          <Cargando />
        ) : (
          <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie">
            {datos.terminales.map((t) => (
              <li
                key={t.terminalId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-texto">{t.nombre}</span>
                  <span className="text-xs text-texto-tenue">{t.sucursal}</span>
                </span>

                <span
                  className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-medium ${
                    t.enrolada ? 'bg-exito/15 text-exito' : 'bg-advertencia/15 text-advertencia'
                  }`}
                >
                  {t.enrolada ? 'en uso' : t.codigoVigente ? 'código pendiente' : 'sin dispositivo'}
                </span>

                {administra && (
                  <button
                    type="button"
                    onClick={() => {
                      void pedirCodigo(t.terminalId, t.nombre, t.enrolada);
                    }}
                    className={`${ALTO_CONTROL} shrink-0 rounded-md border border-borde px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
                  >
                    Código de alta
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EstadoDelPin({ empleado }: { readonly empleado: Empleado }) {
  if (empleado.bloqueadaHasta !== null && new Date(empleado.bloqueadaHasta) > new Date()) {
    return (
      <span className="shrink-0 rounded-sm bg-peligro/15 px-2 py-0.5 text-xs font-medium text-peligro">
        bloqueado hasta {new Date(empleado.bloqueadaHasta).toLocaleTimeString('es-MX')}
      </span>
    );
  }
  if (!empleado.tienePin) {
    return (
      <span className="shrink-0 rounded-sm bg-advertencia/15 px-2 py-0.5 text-xs font-medium text-advertencia">
        no puede entrar
      </span>
    );
  }
  return <span className="shrink-0 text-xs text-texto-tenue">con PIN</span>;
}

function CodigoReciente({
  terminal,
  codigo,
  onCerrar,
}: {
  readonly terminal: string;
  readonly codigo: string;
  readonly onCerrar: () => void;
}) {
  return (
    <div className="rounded-lg border border-primario bg-primario/5 px-6 py-5">
      <p className="text-sm text-texto-sutil">
        Código para <strong className="text-texto">{terminal}</strong>. Tecléalo en{' '}
        <code className="rounded-sm bg-fondo-sutil px-1">/enrolar</code> desde esa caja. Caduca en
        15 minutos y sirve una sola vez.
      </p>
      <p className="mt-3 font-mono text-5xl font-semibold tracking-[0.3em] tabular-nums text-texto">
        {codigo}
      </p>
      <button
        type="button"
        onClick={onCerrar}
        className={`${ALTO_CONTROL} mt-4 rounded-md border border-borde px-4 text-sm font-medium text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
      >
        Ya lo anoté
      </button>
    </div>
  );
}

function Cargando() {
  return (
    <p className="rounded-lg border border-dashed border-borde px-4 py-8 text-center text-texto-sutil">
      Cargando…
    </p>
  );
}
