'use client';

import { useCallback, useEffect, useState } from 'react';

import { Buscador } from './Buscador';
import { Carrito } from './Carrito';
import { DialogoCaja } from './DialogoCaja';
import { DialogoCobro } from './DialogoCobro';
import { CLASE_IMPORTE, pesos } from './dinero';
import { Ticket } from './Ticket';
import type { ResultadoCobro } from './tipos';
import { useVenta } from './useVenta';
import { ALTO_CONTROL, ALTO_DESTACADO } from './controles';

/**
 * La pantalla de venta (F1.1-A-10).
 *
 * Dos columnas: catálogo a la izquierda, venta a la derecha. La derecha no se
 * desplaza fuera de vista nunca —el total y el botón de cobrar están siempre
 * donde el cajero los dejó— y la izquierda es la única que hace scroll.
 *
 * **Se opera entera con el teclado.** El foco vive en el buscador, F2 cobra,
 * Esc cierra. Un cajero con prisa no mueve la mano al ratón, y un escáner es un
 * teclado que escribe muy rápido: si la pantalla depende del clic, el escáner
 * no sirve para nada.
 */

type Modal = 'ninguno' | 'cobro' | 'caja';

export function PantallaVenta() {
  const venta = useVenta();
  const [modal, setModal] = useState<Modal>('ninguno');
  const [cobro, setCobro] = useState<ResultadoCobro | null>(null);

  const hayLineas = (venta.cotizacion?.lineas.length ?? 0) > 0;
  const cajaAbierta = venta.sesionCajaId !== null;

  const abrirCobro = useCallback(() => {
    if (!hayLineas) return;
    setModal(cajaAbierta ? 'cobro' : 'caja');
  }, [cajaAbierta, hayLineas]);

  useEffect(() => {
    function atajos(evento: KeyboardEvent) {
      if (evento.key === 'F2') {
        evento.preventDefault();
        abrirCobro();
      }
      if (evento.key === 'F4') {
        evento.preventDefault();
        setModal('caja');
      }
    }
    window.addEventListener('keydown', atajos);
    return () => {
      window.removeEventListener('keydown', atajos);
    };
  }, [abrirCobro]);

  return (
    <main className="grid h-dvh grid-rows-[auto_1fr] lg:grid-cols-[1fr_25rem] lg:grid-rows-1">
      <section className="flex min-h-0 flex-col gap-4 p-4 lg:p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-texto">Venta</h1>
          <EstadoCaja
            abierta={cajaAbierta}
            onAbrir={() => {
              setModal('caja');
            }}
          />
        </div>

        <Buscador
          onAgregar={(id) => void venta.agregar(id)}
          deshabilitado={venta.cargando}
          activo={modal === 'ninguno' && cobro === null}
        />

        <p className="hidden text-xs text-texto-tenue lg:block">
          <Tecla>↑ ↓</Tecla> elegir · <Tecla>Enter</Tecla> agregar · <Tecla>F2</Tecla> cobrar ·{' '}
          <Tecla>F4</Tecla> caja · <Tecla>Esc</Tecla> limpiar ·{' '}
          <a href="/corte" className="underline underline-offset-2 hover:text-texto-sutil">
            cerrar turno
          </a>
        </p>
      </section>

      <aside className="flex min-h-0 flex-col border-t border-borde bg-superficie lg:border-t-0 lg:border-l">
        <h2 className="border-b border-borde px-4 py-3 text-sm font-medium text-texto-sutil">
          Esta venta
        </h2>

        <Carrito
          cotizacion={venta.cotizacion}
          onQuitar={(id) => void venta.quitar(id)}
          onCantidad={(id, cantidad) => void venta.cambiarCantidad(id, cantidad)}
          deshabilitado={venta.cargando}
        />

        {venta.error !== null && modal === 'ninguno' && (
          <p
            role="alert"
            className="mx-4 mb-3 rounded-md bg-peligro/10 px-3 py-2 text-sm font-medium text-peligro"
          >
            {venta.error}
          </p>
        )}

        <div className="border-t border-borde p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-medium text-texto-sutil">Total</span>
            <span className={`text-4xl font-semibold text-texto ${CLASE_IMPORTE}`}>
              {pesos(venta.cotizacion?.totalCentavos ?? '0')}
            </span>
          </div>

          <button
            type="button"
            onClick={abrirCobro}
            disabled={!hayLineas || venta.cargando}
            className={`${ALTO_DESTACADO} w-full rounded-md bg-exito text-xl font-semibold text-exito-texto transition-colors hover:bg-exito/90 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Cobrar <kbd className="ml-2 text-sm font-normal opacity-75">F2</kbd>
          </button>
        </div>
      </aside>

      {modal === 'cobro' && venta.cotizacion !== null && (
        <DialogoCobro
          cotizacion={venta.cotizacion}
          cobrando={venta.cargando}
          error={venta.error}
          onCerrar={() => {
            venta.limpiarError();
            setModal('ninguno');
          }}
          onCobrar={async (pagos) => {
            const resultado = await venta.cobrar(pagos);
            if (resultado !== null) {
              setModal('ninguno');
              setCobro(resultado);
            }
            return resultado;
          }}
        />
      )}

      {modal === 'caja' && (
        <DialogoCaja
          onCerrar={() => {
            setModal('ninguno');
          }}
          onAbierta={() => {
            void venta.refrescar();
            setModal(hayLineas ? 'cobro' : 'ninguno');
          }}
        />
      )}

      {cobro !== null && (
        <Ticket
          cobro={cobro}
          onCerrar={() => {
            setCobro(null);
          }}
        />
      )}
    </main>
  );
}

/**
 * El estado de la caja, siempre visible.
 *
 * Sin sesión abierta no se puede cobrar en efectivo, y descubrirlo al pulsar
 * «Cobrar» con el cliente enfrente es tarde. Se dice antes.
 */
function EstadoCaja({
  abierta,
  onAbrir,
}: {
  readonly abierta: boolean;
  readonly onAbrir: () => void;
}) {
  if (abierta) {
    return (
      <span className="flex items-center gap-2 text-sm text-texto-sutil">
        <span aria-hidden="true" className="size-2 rounded-full bg-exito" />
        Caja abierta
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`flex ${ALTO_CONTROL} items-center gap-2 rounded-md border border-advertencia px-3 text-sm font-medium text-advertencia transition-colors hover:bg-advertencia/10 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-advertencia" />
      Caja cerrada · ábrela
    </button>
  );
}

function Tecla({ children }: { readonly children: React.ReactNode }) {
  return (
    <kbd className="rounded-sm border border-borde bg-fondo-sutil px-1.5 py-0.5 font-mono text-texto-sutil">
      {children}
    </kbd>
  );
}
