'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Checkbox } from '@morphiqpos/ui/primitivas/checkbox';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, Dinero, EsqueletoDeLista, Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { PackageCheck, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

import { importeDeLinea, pendienteDe, type LineaParaDevolver } from './devolucion.ts';

/**
 * DEVOLVER UNA VENTA, entera o una parte (D-29 de la 2.4).
 *
 * El cliente vuelve con el ticket y el aceite sin abrir. Quien administra busca la venta
 * por su FOLIO —el que trae el ticket en la mano—, marca cuánto de cada cosa regresa y por
 * dónde sale el dinero, y la pantalla dice ANTES de confirmar cuánto se devuelve, con la
 * misma cuenta que el servidor. El ticket original no se toca: la devolución resta de la
 * venta de hoy, sale del cajón de esta terminal si es en efectivo, y la mercancía vuelve al
 * anaquel.
 *
 * Sólo se ofrecen los métodos con que se PAGÓ esa venta y por no más de lo que entró por
 * ellos: devolver en efectivo lo pagado con tarjeta es la forma más vieja de sacar dinero
 * del cajón, y el servidor lo rechaza igual.
 */

interface VentaParaDevolver {
  readonly ordenId: string;
  readonly folio: string | null;
  readonly estado: string;
  readonly totalCentavos: string;
  readonly lineas: readonly LineaParaDevolver[];
  readonly disponible: readonly { readonly metodo: string; readonly centavos: string }[];
}

interface Devuelta {
  readonly montoCentavos: string;
  readonly metodo: string;
  readonly estado: string;
}

const ETIQUETA_METODO: Readonly<Record<string, string>> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

function mensajeDe(fallo: unknown, porDefecto: string): string {
  return fallo instanceof ErrorApi ? fallo.message : porDefecto;
}

export function DevolucionDeVenta({ alDevolver }: { readonly alDevolver: () => void }) {
  const [folio, setFolio] = useState('');
  const [venta, setVenta] = useState<VentaParaDevolver | null>(null);
  const [cantidades, setCantidades] = useState<Readonly<Record<string, string>>>({});
  const [metodo, setMetodo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [regresa, setRegresa] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tono: 'peligro' | 'atencion'; texto: string } | null>(null);
  const [hecha, setHecha] = useState<Devuelta | null>(null);

  async function buscar(): Promise<void> {
    if (folio.trim() === '') {
      setAviso({ tono: 'atencion', texto: 'Escribe el folio del ticket.' });
      return;
    }
    setOcupado(true);
    setAviso(null);
    setHecha(null);
    try {
      const encontrada = await invocarComando<VentaParaDevolver>('/api/venta/para-devolver', {
        folio: folio.trim(),
      });
      setVenta(encontrada);
      setCantidades({});
      setMetodo(encontrada.disponible[0]?.metodo ?? null);
    } catch (fallo: unknown) {
      setVenta(null);
      setAviso({ tono: 'peligro', texto: mensajeDe(fallo, 'No se encontró esa venta.') });
    } finally {
      setOcupado(false);
    }
  }

  /** La venta que ya no tiene nada por regresar. */
  const yaCompleta = venta?.lineas.every((l) => pendienteDe(l) === '0') ?? false;
  const elegidas = (venta?.lineas ?? [])
    .map((linea) => ({ linea, cantidad: (cantidades[linea.ordenLineaId] ?? '').trim() }))
    .filter((e) => e.cantidad !== '' && e.cantidad !== '0');
  const importes = elegidas.map((e) => importeDeLinea(e.linea, e.cantidad));
  const malas = importes.some((i) => i === null);
  const total = importes.reduce<bigint>((suma, i) => suma + (i ?? 0n), 0n);
  const disponibleDelMetodo = BigInt(
    venta?.disponible.find((d) => d.metodo === metodo)?.centavos ?? '0',
  );

  async function devolver(): Promise<void> {
    if (venta === null || metodo === null) return;
    if (elegidas.length === 0 || malas) {
      setAviso({
        tono: 'atencion',
        texto: 'Marca cuánto regresa de cada cosa, sin pasar de lo vendido.',
      });
      return;
    }
    if (motivo.trim().length < 4) {
      setAviso({ tono: 'atencion', texto: 'Escribe por qué se devuelve.' });
      return;
    }
    setOcupado(true);
    setAviso(null);
    try {
      const resultado = await invocarComando<Devuelta>('/api/venta/devolver-venta', {
        ordenId: venta.ordenId,
        lineas: elegidas.map((e) => ({ ordenLineaId: e.linea.ordenLineaId, cantidad: e.cantidad })),
        metodo,
        motivo: motivo.trim(),
        regresaAlInventario: regresa,
      });
      setHecha(resultado);
      setVenta(null);
      setFolio('');
      setMotivo('');
      setCantidades({});
      alDevolver();
    } catch (fallo: unknown) {
      setAviso({ tono: 'peligro', texto: mensajeDe(fallo, 'No se pudo devolver.') });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Superficie
      como="section"
      nivel={0}
      relleno={4}
      aria-labelledby="devolucion-titulo"
      className="flex flex-col gap-(--espacio-4) lg:col-span-2"
    >
      <div className="flex items-start gap-(--espacio-3)">
        <Undo2 aria-hidden="true" className="mt-(--espacio-1) size-5 shrink-0 text-texto-sutil" />
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 id="devolucion-titulo" className="font-semibold">
            Devolver una venta
          </h2>
          <p className="text-sm text-texto-sutil">
            Por el folio del ticket. Resta de la venta de hoy y el ticket original no se toca.
          </p>
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-(--espacio-2)"
        onSubmit={(evento) => {
          evento.preventDefault();
          void buscar();
        }}
      >
        <div className="flex min-w-40 flex-1 flex-col gap-(--espacio-2)">
          <Label htmlFor="devolucion-folio">Folio del ticket</Label>
          <Input
            id="devolucion-folio"
            inputMode="numeric"
            autoComplete="off"
            value={folio}
            onChange={(evento) => {
              setFolio(evento.target.value);
            }}
          />
        </div>
        <Button type="submit" variant="outline" disabled={ocupado}>
          Buscar la venta
        </Button>
      </form>

      {venta === null && ocupado ? <EsqueletoDeLista filas={2} /> : null}

      {yaCompleta ? (
        <Vacio
          icono={<PackageCheck />}
          titulo="Esta venta ya se devolvió completa."
          explicacion="No queda nada de ella por regresar."
        />
      ) : null}

      {venta === null || yaCompleta ? null : (
        <div className="flex flex-col gap-(--espacio-3)">
          <p className="flex items-baseline justify-between gap-(--espacio-2) text-sm">
            <span className="font-medium">Venta {venta.folio ?? 'sin folio'}</span>
            <span className="inline-flex items-baseline gap-(--espacio-1) text-texto-sutil">
              cobrada <Dinero centavos={Number(venta.totalCentavos)} tamano="sm" />
            </span>
          </p>
          <ul
            aria-label="Lo que regresa"
            className="flex flex-col divide-y divide-borde border-y border-borde"
          >
            {venta.lineas.map((linea) => {
              const queda = pendienteDe(linea);
              return (
                <li
                  key={linea.ordenLineaId}
                  className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-(--espacio-3) py-(--espacio-2)"
                >
                  <Label
                    htmlFor={`devolver-${linea.ordenLineaId}`}
                    className="flex-col items-start gap-(--espacio-1)"
                  >
                    {linea.producto}
                    <span className="text-xs font-normal text-texto-sutil">
                      se vendieron {pendienteDe({ ...linea, devuelta: '0' })}, quedan {queda} por
                      devolver
                    </span>
                  </Label>
                  <Input
                    id={`devolver-${linea.ordenLineaId}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    aria-label={`Cuánto regresa de ${linea.producto}`}
                    value={cantidades[linea.ordenLineaId] ?? ''}
                    disabled={queda === '0'}
                    onChange={(evento) => {
                      setCantidades({ ...cantidades, [linea.ordenLineaId]: evento.target.value });
                    }}
                    className="text-right font-numeros tabular-nums"
                  />
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => {
              setCantidades(
                Object.fromEntries(venta.lineas.map((l) => [l.ordenLineaId, pendienteDe(l)])),
              );
            }}
          >
            Devolver todo lo que queda
          </Button>

          <fieldset>
            <legend className="mb-(--espacio-2) text-sm font-medium">
              Por dónde sale el dinero
            </legend>
            <div className="flex flex-wrap gap-(--espacio-2)">
              {venta.disponible.map((d) => (
                <Button
                  key={d.metodo}
                  type="button"
                  size="sm"
                  variant={metodo === d.metodo ? 'default' : 'outline'}
                  aria-pressed={metodo === d.metodo}
                  onClick={() => {
                    setMetodo(d.metodo);
                  }}
                >
                  {ETIQUETA_METODO[d.metodo] ?? d.metodo} · hasta{' '}
                  <Dinero centavos={Number(d.centavos)} tamano="sm" />
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-(--espacio-2)">
            <Label htmlFor="devolucion-motivo">Por qué se devuelve</Label>
            <Input
              id="devolucion-motivo"
              placeholder="venía abierto · no era el que quería"
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value);
              }}
            />
          </div>
          <div className="flex items-center gap-(--espacio-2)">
            <Checkbox
              id="devolucion-regresa"
              checked={regresa}
              onCheckedChange={(valor) => {
                setRegresa(valor === true);
              }}
            />
            <Label htmlFor="devolucion-regresa">La mercancía regresa al anaquel</Label>
          </div>

          <p className="flex items-baseline justify-between gap-(--espacio-2)" aria-live="polite">
            <span className="text-sm text-texto-sutil">Se devuelven</span>
            <Dinero centavos={Number(total)} tamano="lg" />
          </p>
          {total > disponibleDelMetodo && metodo !== null ? (
            <Aviso
              tono="atencion"
              titulo="Por ese método entró menos de lo que se quiere devolver."
            />
          ) : null}
          <Button
            type="button"
            size="lg"
            disabled={ocupado || total === 0n || malas || total > disponibleDelMetodo}
            cargando={ocupado}
            onClick={() => {
              void devolver();
            }}
          >
            Devolver
          </Button>
        </div>
      )}

      {aviso === null ? null : <Aviso tono={aviso.tono} titulo={aviso.texto} />}
      {hecha === null ? null : (
        <Aviso tono="exito" titulo="Devolución hecha">
          <p className="inline-flex flex-wrap items-baseline gap-(--espacio-1)">
            Salieron <Dinero centavos={Number(hecha.montoCentavos)} tamano="sm" /> por{' '}
            {(ETIQUETA_METODO[hecha.metodo] ?? hecha.metodo).toLowerCase()}. La venta quedó{' '}
            {hecha.estado === 'reembolsada' ? 'devuelta completa' : 'devuelta en parte'}.
          </p>
        </Aviso>
      )}
    </Superficie>
  );
}
