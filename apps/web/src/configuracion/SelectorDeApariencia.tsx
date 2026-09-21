'use client';

import { useState } from 'react';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dinero, Superficie } from '@morphiqpos/ui/sistema';
import { CLAVES_ESTILO, ESTILOS, PERILLAS, atributosDeEstilo } from '@morphiqpos/ui/tokens';

import { useAparienciaEnVivo } from '~/proveedores/Apariencia';

/**
 * EL SELECTOR DE ESTILO VISUAL · donde Miguel lo pidió.
 *
 * Vive en Configuración → Modo Presentación, que es la pantalla desde la que se
 * cambia de modelo de negocio delante de un prospecto. Aquí se cambia de PIEL.
 *
 * ── Las cuatro decisiones que lo hacen útil y no un adorno ────────────────
 *
 *   1 · **Vista previa DE VERDAD.** No un cuadrito de color: una tarjeta, un botón,
 *       una cifra de dinero y una línea de tabla, pintados con los tokens de ESE
 *       estilo. Un cuadrito de color no dice si la tabla densa sigue leyéndose.
 *   2 · **Las cuatro perillas**, además del estilo. Con ellas, de ocho estilos salen
 *       decenas de combinaciones y cada cliente tiene la suya.
 *   3 · **Cambia EN VIVO**, sin recargar: son cinco atributos del `<html>`. Es lo
 *       que hace que se sienta mágico cuando se lo enseñas a alguien.
 *   4 · **Se guarda por ORGANIZACIÓN**, no por navegador. Es la marca del negocio,
 *       no una preferencia de quien está en la caja: si la cambiara un cajero, el
 *       siguiente turno encontraría otro sistema.
 *
 * ── Por qué está aquí y no dentro de `heredado/` ──────────────────────────
 * `verify:aspecto` compara cada archivo del heredado contra el commit en que Miguel
 * lo entregó, clase por clase y texto por texto. Escribir esta sección ahí dentro
 * haría fallar esa puerta por decenas de testigos nuevos — y esa puerta existe para
 * que nadie le rompa su diseño sin querer. Se monta desde allí con una línea.
 */

/** Lo que se ve de cada estilo antes de elegirlo. */
function VistaPrevia({ estilo }: { readonly estilo: string }) {
  return (
    <div
      {...atributosDeEstilo(estilo)}
      className="pointer-events-none rounded-md bg-background p-(--espacio-3) text-foreground"
    >
      <Superficie nivel={2} relleno={3} className="flex flex-col gap-(--espacio-2)">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Total</span>
          <Dinero centavos={43900} tamano="lg" />
        </div>
        <div className="flex items-center gap-(--espacio-2)">
          <span className="h-(--altura-control) flex-1 rounded-md bg-primary" />
          <span className="h-(--altura-control) w-10 rounded-md border border-input bg-card" />
        </div>
        <div className="flex flex-col gap-px">
          <span className="h-1.5 w-full rounded-sm bg-muted" />
          <span className="h-1.5 w-4/5 rounded-sm bg-muted" />
        </div>
      </Superficie>
    </div>
  );
}

export function SelectorDeApariencia() {
  const { apariencia, cambiarEstilo, ajustar } = useAparienciaEnVivo();
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await fetch('/api/configuracion/apariencia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          estilo: apariencia.estilo,
          densidad: apariencia.densidad,
          redondeo: apariencia.redondeo,
          elevacion: apariencia.elevacion,
          movimiento: apariencia.movimiento,
        }),
      });
      const cuerpo = (await respuesta.json()) as {
        ok?: boolean;
        error?: { mensaje?: string };
      };
      setMensaje(
        cuerpo.ok === true
          ? 'Guardado. Todo el negocio lo verá así.'
          : (cuerpo.error?.mensaje ?? 'No se pudo guardar la apariencia.'),
      );
    } catch {
      setMensaje('No se pudo guardar: revisa la conexión.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="flex flex-col gap-(--espacio-4)">
      <header>
        <h3 className="text-lg font-semibold">Estilo visual</h3>
        <p className="text-sm text-muted-foreground">
          Cambia al instante en toda la aplicación. Se guarda para el negocio entero, no sólo para
          esta computadora.
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-(--espacio-3) sm:grid-cols-4">
        {CLAVES_ESTILO.map((clave) => {
          const definicion = ESTILOS[clave];
          const elegido = apariencia.estilo === clave;
          return (
            <li key={clave}>
              <button
                type="button"
                aria-pressed={elegido}
                onClick={() => {
                  cambiarEstilo(clave);
                  setMensaje(null);
                }}
                className={`flex w-full flex-col gap-(--espacio-2) rounded-lg border p-(--espacio-2) text-left transition-[box-shadow,border-color] duration-(--duracion-rapida) focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  elegido ? 'border-primary shadow-2' : 'border-border hover:shadow-1'
                }`}
              >
                <VistaPrevia estilo={clave} />
                <span className="px-1">
                  <span className="block text-sm font-medium">{definicion?.nombre ?? clave}</span>
                  <span className="block text-xs text-muted-foreground">
                    {definicion?.referencia ?? ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted-foreground">{ESTILOS[apariencia.estilo]?.para ?? ''}</p>

      <div className="flex flex-wrap items-end gap-(--espacio-4)">
        {(['densidad', 'redondeo', 'elevacion', 'movimiento'] as const).map((perilla) => (
          <label key={perilla} className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="capitalize">{perilla}</span>
            <select
              value={apariencia[perilla]}
              onChange={(evento) => {
                ajustar(perilla, evento.target.value as never);
                setMensaje(null);
              }}
              className="h-(--altura-control) rounded-md border border-input bg-card px-(--espacio-2) text-sm text-foreground"
            >
              {PERILLAS[perilla].map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-(--espacio-3)">
        <Button
          cargando={guardando}
          onClick={() => {
            void guardar();
          }}
        >
          Guardar para el negocio
        </Button>
        {mensaje === null ? null : (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {mensaje}
          </p>
        )}
      </div>
    </section>
  );
}
