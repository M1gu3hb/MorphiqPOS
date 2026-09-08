'use client';

import { useEffect, useState } from 'react';

import { invocarComando } from '@/cliente/api';

import { CLASE_IMPORTE, cantidadLegible, pesos } from './dinero';
import type { ResultadoCobro, TicketImpreso } from './tipos';
import { ALTO_ACCION } from './controles';

/**
 * El ticket (F1.1-A-12).
 *
 * Se renderiza como JSX y se imprime con `window.print()` sobre una hoja carta.
 * **No hay `document.write`, ni `innerHTML`, ni una ventana emergente con HTML
 * armado a mano.** El nombre de un producto es texto que alguien escribió en el
 * catálogo, y concatenarlo dentro de HTML sería inyectarlo; aquí React lo
 * escapa por construcción.
 *
 * Los importes son los CONGELADOS de la orden, no un recálculo: reimprimir un
 * ticket dentro de seis meses tiene que dar el mismo papel que se le dio al
 * cliente, aunque el precio de lista haya cambiado tres veces.
 */

interface Props {
  readonly cobro: ResultadoCobro;
  readonly onCerrar: () => void;
}

export function Ticket({ cobro, onCerrar }: Props) {
  const [ticket, setTicket] = useState<TicketImpreso | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    invocarComando<TicketImpreso>('/api/venta/ticket', { ordenId: cobro.ordenId })
      .then((datos) => {
        if (vivo) setTicket(datos);
      })
      .catch(() => {
        // La venta YA se cobró: el ticket es un comprobante, no el cobro. Se
        // dice que no se pudo traer y se deja seguir vendiendo.
        if (vivo) setError('La venta se cobró, pero no se pudo cargar el ticket.');
      });
    return () => {
      vivo = false;
    };
  }, [cobro.ordenId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo/60 p-4 print:static print:bg-transparent print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ticket"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-borde bg-superficie shadow-2 print:max-w-none print:border-0 print:shadow-none">
        <header className="bg-exito px-6 py-5 text-exito-texto print:hidden">
          <h2 id="titulo-ticket" className="text-sm font-medium opacity-90">
            Cobrado · {cobro.serie}-{cobro.folio}
          </h2>
          <p className={`mt-1 text-4xl font-semibold ${CLASE_IMPORTE}`}>
            Cambio {pesos(cobro.cambioCentavos)}
          </p>
        </header>

        {error !== null && (
          <p role="alert" className="px-6 py-4 text-sm font-medium text-peligro print:hidden">
            {error}
          </p>
        )}

        {ticket !== null && <Papel ticket={ticket} />}

        <footer className="flex gap-3 border-t border-borde px-6 py-4 print:hidden">
          <button
            type="button"
            onClick={() => {
              window.print();
            }}
            disabled={ticket === null}
            className={`${ALTO_ACCION} flex-1 rounded-md border border-borde font-medium text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:opacity-50`}
          >
            Imprimir
          </button>
          <button
            type="button"
            autoFocus
            onClick={onCerrar}
            className={`${ALTO_ACCION} flex-[2] rounded-md bg-primario font-semibold text-primario-texto transition-colors hover:bg-primario/90 focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none`}
          >
            Siguiente venta <kbd className="ml-1 text-xs opacity-75">Enter</kbd>
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * El papel. Ancho de carta al imprimir, legible en pantalla.
 *
 * Tipografía monoespaciada y columnas alineadas: es el formato que un ticket
 * tiene desde antes de que existiera la web, y funciona porque los importes
 * quedan uno debajo de otro.
 */
function Papel({ ticket }: { readonly ticket: TicketImpreso }) {
  return (
    <article className="max-h-[50vh] overflow-y-auto px-6 py-5 font-mono text-sm text-texto print:max-h-none print:overflow-visible print:px-0">
      <header className="text-center">
        <p className="text-base font-semibold">{ticket.organizacionNombre}</p>
        <p className="text-texto-sutil">{ticket.sucursalNombre}</p>
        <p className="mt-1 text-texto-tenue">
          {ticket.serie}
          {ticket.folio === null ? '' : `-${ticket.folio}`} ·{' '}
          {new Date(ticket.emitidoEn).toLocaleString('es-MX')}
        </p>
      </header>

      <table className="mt-4 w-full">
        <caption className="sr-only">Productos de esta venta</caption>
        <thead>
          <tr className="border-b border-borde text-left text-texto-tenue">
            <th scope="col" className="pb-1 font-normal">
              Producto
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Cant.
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Importe
            </th>
          </tr>
        </thead>
        <tbody>
          {ticket.lineas.map((l, i) => (
            <tr key={`${l.nombre}-${String(i)}`}>
              <td className="py-1 pr-2">{l.nombre}</td>
              <td className={`py-1 text-right ${CLASE_IMPORTE}`}>
                {cantidadLegible(l.cantidad)} {l.unidad}
              </td>
              <td className={`py-1 text-right ${CLASE_IMPORTE}`}>{pesos(l.importeCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-4 border-t border-borde pt-2">
        <Fila termino="Subtotal" valor={ticket.subtotalCentavos} />
        {ticket.descuentoCentavos !== '0' && (
          <Fila termino="Descuento" valor={ticket.descuentoCentavos} />
        )}
        <Fila termino="IVA incluido" valor={ticket.impuestosCentavos} />
        <Fila termino="TOTAL" valor={ticket.totalCentavos} fuerte />
      </dl>

      <dl className="mt-3 border-t border-borde pt-2">
        {ticket.pagos.map((p, i) => (
          <div key={`${p.metodo}-${String(i)}`}>
            <Fila termino={p.metodo} valor={p.montoCentavos} />
            {p.recibidoCentavos !== null && (
              <>
                <Fila termino="Recibido" valor={p.recibidoCentavos} />
                <Fila termino="Cambio" valor={p.cambioCentavos} />
              </>
            )}
          </div>
        ))}
      </dl>

      <p className="mt-5 text-center text-texto-tenue">¡Gracias por su compra!</p>
    </article>
  );
}

function Fila({
  termino,
  valor,
  fuerte = false,
}: {
  readonly termino: string;
  readonly valor: string;
  readonly fuerte?: boolean;
}) {
  return (
    <div className={`flex justify-between ${fuerte ? 'mt-1 text-base font-semibold' : ''}`}>
      <dt className="capitalize">{termino}</dt>
      <dd className={CLASE_IMPORTE}>{pesos(valor)}</dd>
    </div>
  );
}
