'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@morphiqpos/ui/primitivas/sheet';
import {
  Aviso,
  Dinero,
  EsqueletoDeLista,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { consultarPuente } from '~/cliente/api';

import {
  autorizadosDeLaObra,
  clientesParaElegir,
  filtrarClientes,
  type AutorizadoDelPuente,
  type CarteraDelPuente,
  type ClienteDelPuente,
  type ClienteParaElegir,
  type ObraDelPuente,
} from './cliente-del-mostrador.ts';

/**
 * ELEGIR AL CLIENTE DE CRÉDITO en el mostrador (C.10 de la 2.4).
 *
 * El mostrador tenía la salida a crédito entera —F11, la remisión, la firma, el aviso del
 * límite— y ninguna forma de elegir a quién: la página lo montaba sin cliente. Aquí se
 * busca por nombre o teléfono, se elige la obra y QUIÉN RECOGE —de la lista del cliente,
 * o a mano, y entonces se avisa que no está en ella—. Todo se lee por el puente; la
 * decisión la vuelve a tomar el servidor al remitir.
 */

export interface EleccionDeCliente {
  readonly cliente: ClienteParaElegir;
  readonly obraId: string | null;
  readonly autorizadoId: string | null;
  /** Quien firma: el autorizado elegido, o el nombre escrito a mano. */
  readonly firmante: string;
}

export function ElegirClienteDelMostrador({
  abierto,
  alCerrar,
  alElegir,
}: {
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  readonly alElegir: (eleccion: EleccionDeCliente) => void;
}) {
  const [clientes, setClientes] = useState<readonly ClienteParaElegir[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<ClienteParaElegir | null>(null);
  const [obraId, setObraId] = useState<string | null>(null);
  const [autorizadoId, setAutorizadoId] = useState<string | null>(null);
  const [aMano, setAMano] = useState('');

  useEffect(() => {
    if (!abierto || clientes !== null) return;
    const control = new AbortController();
    const signal = control.signal;
    Promise.all([
      consultarPuente<ClienteDelPuente>('Cliente', { limite: 500, signal }),
      consultarPuente<CarteraDelPuente>('CarteraPorObra', { limite: 1000, signal }),
      consultarPuente<ObraDelPuente>('Obra', { limite: 1000, signal }),
      consultarPuente<AutorizadoDelPuente>('AutorizadoCuenta', { limite: 1000, signal }),
    ])
      .then(([leidos, cartera, obras, autorizados]) => {
        if (!signal.aborted) setClientes(clientesParaElegir(leidos, cartera, obras, autorizados));
      })
      .catch((error: unknown) => {
        if (!signal.aborted)
          setFallo(error instanceof Error ? error.message : 'No se pudieron leer los clientes.');
      });
    return () => {
      control.abort();
    };
  }, [abierto, clientes]);

  const encontrados = useMemo(
    () => filtrarClientes(clientes ?? [], busqueda).slice(0, 30),
    [clientes, busqueda],
  );

  function elegir(cliente: ClienteParaElegir): void {
    setElegido(cliente);
    setObraId(cliente.obras[0]?.id ?? null);
    setAutorizadoId(null);
    setAMano('');
  }

  const columnas: readonly ColumnaDeTabla<ClienteParaElegir>[] = [
    {
      clave: 'cliente',
      titulo: 'Cliente',
      celda: (c) => (
        <span className="flex flex-col">
          <span className="font-semibold">{c.nombre}</span>
          <span className="text-xs text-texto-sutil">{c.telefono ?? 'sin teléfono'}</span>
        </span>
      ),
    },
    {
      clave: 'debe',
      titulo: 'Debe',
      numerica: true,
      celda: (c) => <Dinero centavos={c.saldoCentavos} tamano="sm" />,
    },
    {
      clave: 'limite',
      titulo: 'Límite',
      numerica: true,
      desde: 'sm',
      celda: (c) => <Dinero centavos={c.limiteCentavos} tamano="sm" />,
    },
    {
      clave: 'elegir',
      titulo: 'Elegir',
      celda: (c) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`A cuenta de ${c.nombre}`}
          onClick={() => {
            elegir(c);
          }}
        >
          Elegir
        </Button>
      ),
    },
  ];

  const posibles = elegido === null ? [] : autorizadosDeLaObra(elegido, obraId);
  const autorizado = posibles.find((a) => a.id === autorizadoId) ?? null;
  const firmante = autorizado?.nombre ?? aMano.trim();

  return (
    <Sheet
      open={abierto}
      onOpenChange={(visible) => {
        if (!visible) alCerrar();
      }}
    >
      <SheetContent side="right" className="w-full gap-(--espacio-3) overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>¿A cuenta de quién?</SheetTitle>
          <SheetDescription>
            Por nombre o por los últimos dígitos del teléfono. Lo que debe y su límite se ven antes
            de despachar.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-(--espacio-3) px-(--espacio-4) pb-(--espacio-4)">
          <div className="relative">
            <Label htmlFor="buscar-cliente" className="sr-only">
              Buscar cliente de crédito
            </Label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
            />
            <Input
              id="buscar-cliente"
              autoFocus
              value={busqueda}
              className="pl-(--espacio-8)"
              placeholder="Construcciones, 4455…"
              onChange={(evento) => {
                setBusqueda(evento.target.value);
                setElegido(null);
              }}
            />
          </div>

          {fallo !== null && (
            <Aviso tono="peligro" titulo="No se pudieron leer los clientes.">
              {fallo}
            </Aviso>
          )}
          {clientes === null && fallo === null && <EsqueletoDeLista filas={4} />}
          {clientes !== null && elegido === null && (
            <Tabla
              etiqueta="Clientes de crédito"
              columnas={columnas}
              filas={encontrados}
              claveDe={(c) => c.id}
              alto="max-h-[60vh]"
              vacio={
                <Vacio
                  icono={<UserRound />}
                  titulo="Nadie con ese nombre."
                  explicacion="El cliente de crédito se da de alta en Cuentas, con su límite."
                />
              }
            />
          )}

          {elegido !== null && (
            <div className="flex flex-col gap-(--espacio-3)">
              <p className="font-semibold">{elegido.nombre}</p>
              {elegido.obras.length > 0 && (
                <div
                  role="group"
                  aria-label="Para qué obra"
                  className="flex flex-wrap gap-(--espacio-1)"
                >
                  {elegido.obras.map((obra) => (
                    <Button
                      key={obra.id}
                      type="button"
                      size="sm"
                      variant={obraId === obra.id ? 'default' : 'outline'}
                      aria-pressed={obraId === obra.id}
                      onClick={() => {
                        setObraId(obra.id);
                        setAutorizadoId(null);
                      }}
                    >
                      {obra.nombre}
                    </Button>
                  ))}
                </div>
              )}
              <div
                role="group"
                aria-label="Quién recoge"
                className="flex flex-wrap gap-(--espacio-1)"
              >
                {posibles.map((a) => (
                  <Button
                    key={a.id}
                    type="button"
                    size="sm"
                    variant={autorizadoId === a.id ? 'default' : 'outline'}
                    aria-pressed={autorizadoId === a.id}
                    onClick={() => {
                      setAutorizadoId(a.id);
                      setAMano('');
                    }}
                  >
                    {a.nombre}
                  </Button>
                ))}
              </div>
              <div className="flex flex-col gap-(--espacio-1)">
                <Label htmlFor="recoge-a-mano">
                  {posibles.length === 0 ? 'Quién recoge' : 'O alguien que no está en la lista'}
                </Label>
                <Input
                  id="recoge-a-mano"
                  value={aMano}
                  onChange={(evento) => {
                    setAMano(evento.target.value);
                    setAutorizadoId(null);
                  }}
                />
                {aMano.trim() !== '' && (
                  <p className="text-xs font-semibold">
                    No está en la lista: ¿le hablas al cliente antes de despachar?
                  </p>
                )}
              </div>
              <Button
                type="button"
                disabled={firmante.length < 2}
                onClick={() => {
                  alElegir({ cliente: elegido, obraId, autorizadoId, firmante });
                }}
              >
                A cuenta de {elegido.nombre}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
