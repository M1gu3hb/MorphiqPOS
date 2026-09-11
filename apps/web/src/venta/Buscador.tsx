'use client';

import { useEffect, useRef, useState } from 'react';

import { invocarComando } from '@/cliente/api';

import { CLASE_IMPORTE, pesos } from './dinero';
import type { ProductoEnRejilla } from './tipos';
import { ALTO_ACCION } from './controles';

/**
 * Buscar y agregar. Es el 90 % del trabajo de una caja.
 *
 * Lista densa y no rejilla de tarjetas: el cajero busca por nombre o escanea, y
 * lee el precio en una columna alineada. Una rejilla de tarjetas idénticas se
 * ve más bonita en una captura y se lee peor a un metro de distancia.
 *
 * El campo no pierde el foco nunca: un escáner de código de barras es un
 * teclado que escribe muy rápido y termina con Enter. Si el foco se va, el
 * escaneo se pierde.
 */

interface Props {
  readonly onAgregar: (productoId: string) => void;
  readonly deshabilitado: boolean;
}

export function Buscador({ onAgregar, deshabilitado }: Props) {
  const [texto, setTexto] = useState('');
  const [productos, setProductos] = useState<readonly ProductoEnRejilla[]>([]);
  const [resaltado, setResaltado] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const control = new AbortController();
    // 180 ms: por debajo se dispara una consulta por tecla; por encima el
    // cajero ya escribió la siguiente palabra y ve resultados viejos.
    const temporizador = setTimeout(() => {
      invocarComando<{ productos: ProductoEnRejilla[] }>(
        '/api/venta/buscar',
        { busqueda: texto, limite: 40 },
        { signal: control.signal },
      )
        .then((datos) => {
          setProductos(datos.productos);
          setResaltado(0);
        })
        .catch(() => {
          // Una búsqueda abortada al teclear la siguiente letra no es un error
          // que mostrarle a nadie. Los fallos reales se ven al agregar.
        });
    }, 180);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [texto]);

  useEffect(() => {
    lista.current?.querySelector('[data-resaltado="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [resaltado]);

  function alTeclear(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setResaltado((i) => Math.min(i + 1, productos.length - 1));
      return;
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
      return;
    }
    if (evento.key === 'Enter') {
      evento.preventDefault();
      const elegido = productos[resaltado];
      if (elegido === undefined) return;
      onAgregar(elegido.id);
      // Se vacía el campo tras agregar: la siguiente lectura del escáner entra
      // limpia, sin concatenarse con el código anterior.
      setTexto('');
      return;
    }
    if (evento.key === 'Escape') setTexto('');
  }

  return (
    <section className="flex min-h-0 flex-col gap-3" aria-label="Catálogo">
      <div className="relative">
        <input
          ref={campo}
          type="search"
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
          }}
          onKeyDown={alTeclear}
          onBlur={() => setTimeout(() => campo.current?.focus(), 0)}
          placeholder="Escanea o escribe el producto…"
          aria-label="Buscar producto"
          aria-controls="resultados-venta"
          className={`${ALTO_ACCION} w-full rounded-md border border-borde bg-superficie px-4 text-lg text-texto placeholder:text-texto-tenue focus-visible:border-anillo focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
        />
      </div>

      {productos.length === 0 ? (
        <p className="rounded-md border border-dashed border-borde px-4 py-10 text-center text-texto-sutil">
          {texto === ''
            ? 'Escanea un producto o escribe su nombre para empezar.'
            : `Nada coincide con «${texto}».`}
        </p>
      ) : (
        <ul
          ref={lista}
          id="resultados-venta"
          className="min-h-0 flex-1 divide-y divide-borde overflow-y-auto rounded-md border border-borde bg-superficie"
        >
          {productos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                data-resaltado={i === resaltado}
                disabled={deshabilitado}
                onClick={() => {
                  onAgregar(p.id);
                  setTexto('');
                  campo.current?.focus();
                }}
                className="flex w-full items-baseline gap-4 px-4 py-3 text-left transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none data-[resaltado=true]:bg-fondo-sutil disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-texto">{p.nombre}</span>
                {p.existencia !== null && (
                  <span className="shrink-0 text-xs text-texto-tenue">{p.existencia} disp.</span>
                )}
                <span className={`shrink-0 font-semibold text-texto ${CLASE_IMPORTE}`}>
                  {pesos(p.precioVentaCentavos)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
