'use client';

import { CLASE_IMPORTE, cantidadLegible, pesos } from './dinero';
import type { Cotizacion } from './tipos';
import { CUADRO_TOQUE } from './controles';

/**
 * El carrito y el total.
 *
 * Todos los importes vienen del servidor ya calculados. Esta vista **no suma
 * nada**: si sumara, podría mostrar un total distinto del que se cobra, y el
 * cajero le habría dicho al cliente un número que no es.
 *
 * El total ocupa el bloque más grande de la pantalla a propósito. Es el único
 * número que el cajero dice en voz alta, y se lee desde el otro lado del
 * mostrador.
 */

interface Props {
  readonly cotizacion: Cotizacion | null;
  readonly onQuitar: (lineaId: string) => void;
  readonly onCantidad: (lineaId: string, cantidad: string) => void;
  readonly deshabilitado: boolean;
}

export function Carrito({ cotizacion, onQuitar, onCantidad, deshabilitado }: Props) {
  const lineas = cotizacion?.lineas ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {lineas.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 text-center text-texto-sutil">
          Todavía no hay nada en esta venta.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-borde overflow-y-auto">
          {lineas.map((linea) => (
            <li key={linea.id} className="px-4 py-3">
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate font-medium text-texto">
                  {linea.productoNombre}
                </span>
                <span className={`font-semibold text-texto ${CLASE_IMPORTE}`}>
                  {pesos(linea.subtotalCentavos)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <BotonCantidad
                  etiqueta={`Quitar uno de ${linea.productoNombre}`}
                  signo="−"
                  deshabilitado={deshabilitado}
                  onClick={() => {
                    const nueva = Number(linea.cantidad) - 1;
                    if (nueva <= 0) onQuitar(linea.id);
                    else onCantidad(linea.id, String(nueva));
                  }}
                />
                <span className={`min-w-14 text-center text-sm text-texto-sutil ${CLASE_IMPORTE}`}>
                  {cantidadLegible(linea.cantidad)} {linea.unidad}
                </span>
                <BotonCantidad
                  etiqueta={`Agregar uno de ${linea.productoNombre}`}
                  signo="+"
                  deshabilitado={deshabilitado}
                  onClick={() => {
                    onCantidad(linea.id, String(Number(linea.cantidad) + 1));
                  }}
                />

                <span className={`ml-auto text-xs text-texto-tenue ${CLASE_IMPORTE}`}>
                  {pesos(linea.precioUnitarioCentavos)} c/u
                </span>

                {linea.esMayoreo && (
                  <span className="rounded-sm bg-exito/15 px-1.5 py-0.5 text-xs font-medium text-exito">
                    mayoreo
                  </span>
                )}

                <button
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => {
                    onQuitar(linea.id);
                  }}
                  aria-label={`Quitar ${linea.productoNombre} de la venta`}
                  className={`${CUADRO_TOQUE} shrink-0 rounded-md text-texto-tenue transition-colors hover:bg-peligro/10 hover:text-peligro focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:opacity-40`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cotizacion !== null && lineas.length > 0 && (
        <dl className="border-t border-borde px-4 py-3 text-sm">
          <Renglon termino="Subtotal" valor={cotizacion.subtotalCentavos} />
          {cotizacion.descuentoCentavos !== '0' && (
            <Renglon termino="Descuento" valor={cotizacion.descuentoCentavos} />
          )}
          <Renglon termino="IVA incluido" valor={cotizacion.impuestosCentavos} tenue />
        </dl>
      )}
    </div>
  );
}

function Renglon({
  termino,
  valor,
  tenue = false,
}: {
  readonly termino: string;
  readonly valor: string;
  readonly tenue?: boolean;
}) {
  return (
    <div className="flex justify-between py-0.5">
      <dt className={tenue ? 'text-texto-tenue' : 'text-texto-sutil'}>{termino}</dt>
      <dd className={`${CLASE_IMPORTE} ${tenue ? 'text-texto-tenue' : 'text-texto-sutil'}`}>
        {pesos(valor)}
      </dd>
    </div>
  );
}

/** 44 px de lado: es el mínimo táctil, y esta caja también vive en tablet. */
function BotonCantidad({
  etiqueta,
  signo,
  onClick,
  deshabilitado,
}: {
  readonly etiqueta: string;
  readonly signo: string;
  readonly onClick: () => void;
  readonly deshabilitado: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={onClick}
      disabled={deshabilitado}
      className={`${CUADRO_TOQUE} shrink-0 rounded-md border border-borde text-lg leading-none text-texto transition-colors hover:bg-fondo-sutil focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none disabled:opacity-40`}
    >
      {signo}
    </button>
  );
}
