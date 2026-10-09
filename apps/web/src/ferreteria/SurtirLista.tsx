'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Checkbox } from '@morphiqpos/ui/primitivas/checkbox';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  EsqueletoDeLista,
  ErrorDePantalla,
  Superficie,
  Vacio,
} from '@morphiqpos/ui/sistema';
import { ClipboardList, PackageCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import { buscar, normalizar, type MaterialDeMostrador } from './buscar-material.ts';
import {
  capturaInicial,
  pedidoDeSurtido,
  type CapturaDeRenglon,
  type RenglonDeLista,
} from './surtido-de-lista.ts';

/**
 * SURTIR LA LISTA DEL ALBAÑIL (F-153, C.10 de la 2.4).
 *
 * Los renglones tal cual los dictó, y por cada uno: a qué producto se traduce si
 * todavía es texto, cuánto pidió, cuánto se entrega ahora y si no hay. «Mandar a
 * caja» abre UNA nota con su folio —la que el cliente canta en la caja— y la lista
 * cuenta lo entregado. Antes la pantalla decía que esto «pasa en la venta», y la
 * venta no sabía de listas: se volvía a teclear todo.
 */

const RUTA_RENGLONES = '/api/venta/lista-trabajo/renglones';
const RUTA_SURTIR = '/api/venta/lista-trabajo/surtir';
const RESULTADOS = 5;

export interface ListaParaSurtir {
  readonly listaId: string;
  readonly folio: string;
  readonly cliente: string;
}

export interface ResultadoDelSurtido {
  readonly listaId: string;
  readonly estado: string;
  readonly notaFolio: string | null;
  readonly partidas: number;
}

function mensajeDe(fallo: unknown, porDefecto: string): string {
  return fallo instanceof ErrorApi ? fallo.error.mensaje : porDefecto;
}

interface RenglonProps {
  readonly renglon: RenglonDeLista;
  readonly captura: CapturaDeRenglon;
  readonly catalogo: readonly MaterialDeMostrador[];
  readonly alCambiar: (captura: CapturaDeRenglon) => void;
}

function Renglon({ renglon, captura, catalogo, alCambiar }: RenglonProps) {
  const [consulta, setConsulta] = useState('');
  const palabras = normalizar(consulta)
    .split(' ')
    .filter((p) => p !== '');
  const hallados = buscar(catalogo, palabras).slice(0, RESULTADOS);
  const traducido = renglon.cantidad !== null && renglon.productoId === captura.productoId;
  const campo = (sufijo: string): string => `${renglon.renglonId}-${sufijo}`;

  return (
    <li className="flex flex-col gap-(--espacio-2) border-b border-borde py-(--espacio-3) last:border-b-0">
      <p className="font-semibold">«{renglon.textoPedido}»</p>
      {captura.productoId === null ? (
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor={campo('que')}>¿Qué es?</Label>
          <Input
            id={campo('que')}
            value={consulta}
            placeholder="varilla 3/8, cemento gris…"
            onChange={(evento) => {
              setConsulta(evento.target.value);
            }}
          />
          {hallados.length > 0 && (
            <ul className="flex flex-wrap gap-(--espacio-1)" aria-label="Productos que coinciden">
              {hallados.map((m) => (
                <li key={m.id}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      alCambiar({
                        ...captura,
                        productoId: m.id,
                        productoNombre: `${m.nombre} ${m.medida}`,
                      });
                    }}
                  >
                    {m.nombre} {m.medida}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-(--espacio-2) text-sm">
          <span>{captura.productoNombre ?? 'Producto elegido'}</span>
          {renglon.cantidad !== null && (
            <span className="text-texto-sutil tabular-nums">
              pidió {renglon.cantidad} · llevan {renglon.surtida}
            </span>
          )}
          {Number(renglon.surtida) === 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Cambiar el producto de «${renglon.textoPedido}»`}
              onClick={() => {
                alCambiar({ ...captura, productoId: null, productoNombre: null });
              }}
            >
              <X aria-hidden="true" /> Cambiar
            </Button>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-(--espacio-3)">
        {!traducido && (
          <div className="flex w-28 flex-col gap-(--espacio-1)">
            <Label htmlFor={campo('pidio')}>Pidió</Label>
            <Input
              id={campo('pidio')}
              inputMode="decimal"
              value={captura.pedida}
              onChange={(evento) => {
                alCambiar({ ...captura, pedida: evento.target.value });
              }}
            />
          </div>
        )}
        <div className="flex w-28 flex-col gap-(--espacio-1)">
          <Label htmlFor={campo('ahora')}>Se entrega</Label>
          <Input
            id={campo('ahora')}
            inputMode="decimal"
            value={captura.ahora}
            onChange={(evento) => {
              alCambiar({ ...captura, ahora: evento.target.value });
            }}
          />
        </div>
        <Label htmlFor={campo('nohay')} className="flex items-center gap-(--espacio-2) pb-2">
          <Checkbox
            id={campo('nohay')}
            checked={captura.noHay}
            onCheckedChange={(marcado) => {
              alCambiar({ ...captura, noHay: marcado === true });
            }}
          />
          No hay
        </Label>
      </div>
    </li>
  );
}

export function SurtirLista({
  lista,
  alTerminar,
  alCerrar,
}: {
  readonly lista: ListaParaSurtir;
  readonly alTerminar: (resultado: ResultadoDelSurtido) => void;
  readonly alCerrar: () => void;
}) {
  const voc = useVocabulario();
  const [renglones, setRenglones] = useState<readonly RenglonDeLista[] | null>(null);
  const [catalogo, setCatalogo] = useState<readonly MaterialDeMostrador[]>([]);
  const [capturas, setCapturas] = useState<Readonly<Record<string, CapturaDeRenglon>>>({});
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    Promise.all([
      invocarComando<{ readonly renglones: readonly RenglonDeLista[] }>(RUTA_RENGLONES, {
        listaId: lista.listaId,
      }),
      consultarPuente<MaterialDeMostrador>('MaterialMostrador', {
        limite: 6000,
        signal: control.signal,
      }),
    ])
      .then(([leida, materiales]) => {
        if (control.signal.aborted) return;
        setRenglones(leida.renglones);
        setCapturas(
          Object.fromEntries(leida.renglones.map((r) => [r.renglonId, capturaInicial(r)])),
        );
        setCatalogo(materiales);
      })
      .catch((fallo: unknown) => {
        if (!control.signal.aborted) setFalloDeCarga(mensajeDe(fallo, 'No se pudo leer la lista.'));
      });
    return () => {
      control.abort();
    };
  }, [lista.listaId, intento]);

  const encabezado = (
    <div className="flex items-start justify-between gap-(--espacio-2)">
      <h2 id="surtir-lista" className="font-semibold">
        Surtir la {lista.folio} · {lista.cliente}
      </h2>
      <Button type="button" size="sm" variant="ghost" onClick={alCerrar}>
        Cerrar
      </Button>
    </div>
  );

  if (falloDeCarga !== null) {
    return (
      <Superficie como="section" aria-labelledby="surtir-lista" relleno={4} radio="md">
        {encabezado}
        <ErrorDePantalla
          titulo="No se pudo leer la lista."
          queHacer="Revisa la conexión y vuelve a leerla. No se entregó nada."
          detalle={falloDeCarga}
          reintentar={
            <Button
              onClick={() => {
                setFalloDeCarga(null);
                setIntento((n) => n + 1);
              }}
            >
              Volver a leer
            </Button>
          }
        />
      </Superficie>
    );
  }

  const pedido = renglones === null ? null : pedidoDeSurtido(lista.listaId, renglones, capturas);

  function mandar(): void {
    if (pedido === null || pedido.problemas.length > 0) return;
    setEnviando(true);
    setError(null);
    invocarComando<ResultadoDelSurtido>(RUTA_SURTIR, pedido.cuerpo)
      .then(alTerminar)
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo, 'No se pudo surtir la lista.'));
      })
      .finally(() => {
        setEnviando(false);
      });
  }

  return (
    <Superficie
      como="section"
      aria-labelledby="surtir-lista"
      relleno={4}
      radio="md"
      className="flex flex-col gap-(--espacio-3)"
    >
      {encabezado}
      {renglones === null ? (
        <EsqueletoDeLista filas={4} />
      ) : renglones.length === 0 ? (
        <Vacio
          icono={<ClipboardList />}
          titulo="Esta lista no tiene renglones."
          explicacion="Una lista se captura con al menos uno: si llegó vacía, ciérrala y captúrala de nuevo."
        />
      ) : (
        <ol className="flex flex-col">
          {renglones.map((r) => (
            <Renglon
              key={r.renglonId}
              renglon={r}
              captura={capturas[r.renglonId] ?? capturaInicial(r)}
              catalogo={catalogo}
              alCambiar={(captura) => {
                setCapturas((previas) => ({ ...previas, [r.renglonId]: captura }));
              }}
            />
          ))}
        </ol>
      )}
      {error !== null && (
        <Aviso tono="peligro" titulo={error}>
          No se abrió ninguna {voc.singular('orden').toLowerCase()} y la lista no cambió.
        </Aviso>
      )}
      {pedido !== null && pedido.problemas.length > 0 && (
        <Aviso tono="atencion" titulo="Antes de mandarla:">
          <ul className="list-disc pl-(--espacio-5)">
            {pedido.problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Aviso>
      )}
      <Button
        type="button"
        disabled={pedido === null || pedido.problemas.length > 0 || enviando}
        cargando={enviando}
        onClick={mandar}
      >
        {enviando ? null : <PackageCheck aria-hidden="true" />}
        Mandar a caja
      </Button>
    </Superficie>
  );
}
