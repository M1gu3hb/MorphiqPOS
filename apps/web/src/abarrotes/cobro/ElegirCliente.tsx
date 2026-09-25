'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Dinero,
  EsqueletoDeLista,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Search, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * A QUIÉN · F4 del cobro de la tienda (C.10 de la 2.4).
 *
 * «Se necesita ANTES de cobrar, no después» (`04-INTERFAZ` de abarrotes): el fiado va a
 * nombre de alguien, y el tendero decide si le fía viendo lo que ya debe, desde cuándo y su
 * límite. El sistema no decide por él —el aviso es un dato, no un muro—; el servidor sólo
 * dice que no cuando el crédito ya no da.
 *
 * Y el cliente que nunca ha fiado se da de alta aquí mismo, con nombre y teléfono: mandarlo
 * a otra pantalla con la fila esperando es no fiarle.
 */

export interface ClienteDelCobro {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  /** Lo que debe hoy, en centavos. */
  readonly debe: number;
  readonly diasMasViejo: number | null;
  /** Cero es «sin límite», como en el servidor. */
  readonly limite: number;
}

interface FilaCliente {
  readonly id: string;
  readonly nombre: string | null;
  readonly telefono: string | null;
  readonly limite_credito_centavos: number | null;
}

interface FilaCartera {
  readonly cliente_id: string;
  readonly saldo_centavos: number | null;
  readonly dias_mas_viejo: number | null;
}

/** Tres semanas: desde ahí el saldo ya se volvió una conversación. */
const DIAS_DE_AVISO = 21;

/** Lo que conviene saber antes de fiar, dicho como dato. Nulo si no hay nada que decir. */
export function avisoDeFiado(cliente: ClienteDelCobro, importe: number): string | null {
  if (cliente.limite > 0 && cliente.debe + importe > cliente.limite) {
    return 'Con esta venta pasa de su límite: el sistema no la va a fiar.';
  }
  if (cliente.diasMasViejo !== null && cliente.diasMasViejo >= DIAS_DE_AVISO) {
    return `Debe desde hace ${String(cliente.diasMasViejo)} días.`;
  }
  return null;
}

export function unirClientes(
  clientes: readonly FilaCliente[],
  cartera: readonly FilaCartera[],
): readonly ClienteDelCobro[] {
  const deuda = new Map<string, { debe: number; dias: number | null }>();
  for (const fila of cartera) {
    const previa = deuda.get(fila.cliente_id);
    const debe = centavosDe('CarteraFiado', 'saldo_centavos', fila.saldo_centavos) ?? 0;
    deuda.set(fila.cliente_id, {
      debe: (previa?.debe ?? 0) + debe,
      dias: Math.max(previa?.dias ?? 0, fila.dias_mas_viejo ?? 0),
    });
  }
  return clientes.map((c) => ({
    id: c.id,
    nombre: c.nombre ?? 'Sin nombre',
    telefono: c.telefono,
    debe: deuda.get(c.id)?.debe ?? 0,
    diasMasViejo: deuda.get(c.id)?.dias ?? null,
    limite: centavosDe('Cliente', 'limite_credito_centavos', c.limite_credito_centavos) ?? 0,
  }));
}

export function ElegirCliente({
  importe,
  onElegir,
}: {
  /** Lo que se va a fiar, para avisar ANTES si pasa del límite. */
  readonly importe: number;
  readonly onElegir: (cliente: ClienteDelCobro) => void;
}) {
  const [clientes, setClientes] = useState<readonly ClienteDelCobro[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState<{ nombre: string; telefono: string } | null>(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    Promise.all([
      consultarPuente<FilaCliente>('Cliente', { limite: 1_000, signal: control.signal }),
      consultarPuente<FilaCartera>('CarteraFiado', { limite: 1_000, signal: control.signal }),
    ])
      .then(([filas, cartera]) => {
        if (!control.signal.aborted) setClientes(unirClientes(filas, cartera));
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) {
          setFallo(error instanceof Error ? error.message : 'No se pudieron leer los clientes.');
        }
      });
    return () => {
      control.abort();
    };
  }, []);

  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLocaleLowerCase('es-MX');
    const todos = clientes ?? [];
    // Los que deben primero: son los que se buscan en el mostrador.
    const ordenados = [...todos].sort(
      (a, b) => b.debe - a.debe || a.nombre.localeCompare(b.nombre),
    );
    if (aguja === '') return ordenados.slice(0, 12);
    return ordenados.filter(
      (c) =>
        c.nombre.toLocaleLowerCase('es-MX').includes(aguja) ||
        (c.telefono ?? '').includes(aguja.replace(/\D/g, '') || '\u0000'),
    );
  }, [clientes, busqueda]);

  async function darDeAlta(): Promise<void> {
    if (nuevo === null || nuevo.nombre.trim().length < 2) return;
    setCreando(true);
    setFallo(null);
    try {
      const alta = await invocarComando<{ clienteId: string; nombre: string }>('/api/clientes', {
        nombre: nuevo.nombre.trim(),
        telefono: nuevo.telefono.trim() === '' ? null : nuevo.telefono.trim(),
      });
      onElegir({
        id: alta.clienteId,
        nombre: alta.nombre,
        telefono: nuevo.telefono.trim() === '' ? null : nuevo.telefono.trim(),
        debe: 0,
        diasMasViejo: null,
        limite: 0,
      });
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo dar de alta.');
    } finally {
      setCreando(false);
    }
  }

  const columnas: readonly ColumnaDeTabla<ClienteDelCobro>[] = [
    {
      clave: 'nombre',
      titulo: 'Cliente',
      celda: (c) => {
        const aviso = avisoDeFiado(c, importe);
        return (
          <span className="flex flex-col">
            <span className="font-medium">{c.nombre}</span>
            <span className="text-xs text-texto-sutil">{c.telefono ?? 'sin teléfono'}</span>
            {aviso === null ? null : (
              <span className="inline-flex items-center gap-(--espacio-1) text-xs font-medium">
                <TriangleAlert aria-hidden="true" className="size-3 text-advertencia" />
                {aviso}
              </span>
            )}
          </span>
        );
      },
    },
    {
      clave: 'debe',
      titulo: 'Debe',
      numerica: true,
      celda: (c) =>
        c.debe > 0 ? (
          <Dinero centavos={c.debe} tamano="sm" />
        ) : (
          <span className="text-texto-sutil">nada</span>
        ),
    },
    {
      clave: 'limite',
      titulo: 'Límite',
      numerica: true,
      desde: 'sm',
      celda: (c) =>
        c.limite > 0 ? (
          <Dinero centavos={c.limite} tamano="sm" className="text-texto-sutil" />
        ) : (
          <span className="text-texto-sutil">sin límite</span>
        ),
    },
  ];

  if (nuevo !== null) {
    return (
      <form
        className="flex flex-col gap-(--espacio-3)"
        onSubmit={(evento) => {
          evento.preventDefault();
          void darDeAlta();
        }}
      >
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="cliente-nombre">Nombre</Label>
          <Input
            id="cliente-nombre"
            autoFocus
            value={nuevo.nombre}
            onChange={(evento) => {
              setNuevo({ ...nuevo, nombre: evento.target.value });
            }}
          />
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="cliente-telefono">Teléfono (opcional)</Label>
          <Input
            id="cliente-telefono"
            inputMode="tel"
            value={nuevo.telefono}
            onChange={(evento) => {
              setNuevo({ ...nuevo, telefono: evento.target.value });
            }}
          />
        </div>
        {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
        <div className="flex gap-(--espacio-2)">
          <Button type="submit" disabled={creando || nuevo.nombre.trim().length < 2}>
            {creando ? 'Dando de alta…' : 'Dar de alta y elegir'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setNuevo(null);
            }}
          >
            Volver a la lista
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-(--espacio-3)">
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="cliente-busqueda">Nombre o teléfono</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            id="cliente-busqueda"
            autoFocus
            className="pl-(--espacio-10)"
            value={busqueda}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
          />
        </div>
      </div>

      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}

      {clientes === null && fallo === null ? (
        <EsqueletoDeLista filas={4} />
      ) : visibles.length === 0 ? (
        <Vacio
          icono={<Users />}
          titulo={busqueda.trim() === '' ? 'Todavía no hay clientes' : 'Nadie se llama así'}
          explicacion="Dalo de alta con su nombre: el fiado va a nombre de alguien."
        />
      ) : (
        <Tabla
          etiqueta="Clientes"
          columnas={columnas}
          filas={visibles}
          claveDe={(c) => c.id}
          alActivar={(id) => {
            const elegido = visibles.find((c) => c.id === id);
            if (elegido !== undefined) onElegir(elegido);
          }}
          etiquetaDeFila={(c) => `Elegir a ${c.nombre}`}
          alto="max-h-72"
        />
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setNuevo({ nombre: busqueda.trim(), telefono: '' });
        }}
      >
        <UserPlus aria-hidden="true" />
        Cliente nuevo
      </Button>
    </div>
  );
}
