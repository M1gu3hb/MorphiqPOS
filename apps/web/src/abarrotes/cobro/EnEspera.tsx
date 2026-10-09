'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Cifra,
  Dinero,
  EsqueletoDeLista,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Hourglass, PauseCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { invocarComando } from '~/cliente/api';

import type { RenglonRetomado } from './catalogo.ts';
import { paraElServidor, type LineaDeVenta } from './lineas.ts';

/**
 * F6 · «AHORITA VENGO POR LA CARTERA» (F-224, C.10 de la 2.4).
 *
 * Doce artículos escaneados, el cliente se acuerda de que falta el pan y detrás hay cuatro
 * personas. Se aparta con un código corto que se dice en voz alta —«tu venta es la 3»—, se
 * atiende al siguiente, y cuando vuelve se retoma tal cual. Apartar NO mueve inventario: el
 * descuento cuelga del cobro.
 *
 * La lista dice cuánto lleva cada una esperando: una de hace dos horas casi siempre es
 * alguien que ya no volvió. Ésa se CANCELA con su motivo (bloque D de la 2.4): «o se
 * cobra, o se cancela con motivo», y la caja no cierra con ninguna apartada dentro. El
 * motivo queda en la sección de control del corte, con quién la canceló.
 */

interface Apartada {
  readonly ordenId: string;
  readonly codigo: string;
  readonly nota: string | null;
  readonly lineas: number;
  readonly totalCentavos: string;
  readonly minutosEsperando: number;
}

export function EnEspera({
  lineas,
  onApartada,
  onRetomada,
}: {
  readonly lineas: readonly LineaDeVenta[];
  readonly onApartada: (codigo: string) => void;
  readonly onRetomada: (renglones: readonly RenglonRetomado[], codigo: string) => void;
}) {
  const [apartadas, setApartadas] = useState<readonly Apartada[] | null>(null);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  /** La apartada que se está cancelando y su motivo. */
  const [cancelando, setCancelando] = useState<{ codigo: string; motivo: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    invocarComando<{ ventas: readonly Apartada[] }>('/api/venta/en-espera', {})
      .then((respuesta) => {
        if (vigente) setApartadas(respuesta.ventas);
      })
      .catch((error: unknown) => {
        if (vigente)
          setFallo(error instanceof Error ? error.message : 'No se pudo leer lo apartado.');
      });
    return () => {
      vigente = false;
    };
  }, []);

  async function apartar(): Promise<void> {
    setEnviando(true);
    setFallo(null);
    try {
      const apartada = await invocarComando<{ codigo: string }>('/api/venta/suspender-mostrador', {
        lineas: paraElServidor(lineas),
        nota: nota.trim() === '' ? null : nota.trim(),
      });
      onApartada(apartada.codigo);
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo apartar la venta.');
    } finally {
      setEnviando(false);
    }
  }

  async function retomar(codigo: string): Promise<void> {
    setEnviando(true);
    setFallo(null);
    try {
      const retomada = await invocarComando<{ renglones: readonly RenglonRetomado[] }>(
        '/api/venta/retomar',
        { codigo },
      );
      onRetomada(retomada.renglones, codigo);
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo retomar esa venta.');
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar(): Promise<void> {
    if (cancelando === null) return;
    if (cancelando.motivo.trim().length < 4) {
      setFallo('Escribe por qué se cancela.');
      return;
    }
    setEnviando(true);
    setFallo(null);
    try {
      await invocarComando('/api/venta/cancelar-apartada', {
        codigo: cancelando.codigo,
        motivo: cancelando.motivo.trim(),
      });
      setApartadas((previas) => (previas ?? []).filter((a) => a.codigo !== cancelando.codigo));
      setCancelando(null);
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo cancelar esa venta.');
    } finally {
      setEnviando(false);
    }
  }

  const columnas: readonly ColumnaDeTabla<Apartada>[] = [
    {
      clave: 'cual',
      titulo: 'Cuál',
      celda: (a) => (
        <span className="font-medium">
          La {a.codigo}
          {a.nota === null ? '' : ` · ${a.nota}`}
        </span>
      ),
    },
    {
      clave: 'total',
      titulo: 'Total',
      numerica: true,
      celda: (a) => <Dinero centavos={Number(a.totalCentavos)} tamano="sm" />,
    },
    {
      clave: 'espera',
      titulo: 'Espera',
      numerica: true,
      desde: 'sm',
      celda: (a) => <Cifra valor={a.minutosEsperando} unidad="min" tamano="sm" />,
    },
    {
      clave: 'retomar',
      titulo: 'Retomar',
      celda: (a) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Retomar la ${a.codigo}`}
          // Retomar con una venta en la pantalla la pisaría: primero se cobra o se aparta.
          disabled={enviando || lineas.length > 0}
          onClick={() => {
            void retomar(a.codigo);
          }}
        >
          Retomar
        </Button>
      ),
    },
    {
      clave: 'cancelar',
      titulo: 'Cancelar',
      celda: (a) => (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Cancelar la ${a.codigo}`}
          disabled={enviando}
          onClick={() => {
            setCancelando({ codigo: a.codigo, motivo: '' });
          }}
        >
          Cancelar
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-(--espacio-4)">
      {lineas.length === 0 ? null : (
        <form
          className="flex flex-col gap-(--espacio-2)"
          onSubmit={(evento) => {
            evento.preventDefault();
            void apartar();
          }}
        >
          <Label htmlFor="apartar-nota">Para reconocerla (opcional)</Label>
          <Input
            id="apartar-nota"
            autoFocus
            maxLength={60}
            placeholder="El señor de la gorra"
            value={nota}
            onChange={(evento) => {
              setNota(evento.target.value);
            }}
          />
          <Button type="submit" disabled={enviando}>
            <PauseCircle aria-hidden="true" />
            {enviando ? 'Apartando…' : 'Apartar esta venta'}
          </Button>
        </form>
      )}

      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}

      {cancelando === null ? null : (
        <form
          className="flex flex-col gap-(--espacio-2)"
          onSubmit={(evento) => {
            evento.preventDefault();
            void cancelar();
          }}
        >
          <Label htmlFor="cancelar-motivo">Por qué se cancela la {cancelando.codigo}</Label>
          <Input
            id="cancelar-motivo"
            autoFocus
            maxLength={200}
            placeholder="no volvió por ella"
            value={cancelando.motivo}
            onChange={(evento) => {
              setCancelando({ ...cancelando, motivo: evento.target.value });
            }}
          />
          <div className="flex gap-(--espacio-2)">
            <Button type="submit" variant="destructive" disabled={enviando}>
              Cancelar la venta {cancelando.codigo}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCancelando(null);
              }}
            >
              No, dejarla apartada
            </Button>
          </div>
        </form>
      )}

      <section aria-labelledby="apartadas-titulo" className="flex flex-col gap-(--espacio-2)">
        <h3 id="apartadas-titulo" className="text-sm font-medium text-texto-sutil">
          Apartadas en esta caja
        </h3>
        {apartadas === null && fallo === null ? (
          <EsqueletoDeLista filas={2} />
        ) : (apartadas ?? []).length === 0 ? (
          <Vacio icono={<Hourglass />} titulo="No hay nada apartado." />
        ) : (
          <Tabla
            etiqueta="Apartadas en esta caja"
            columnas={columnas}
            filas={apartadas ?? []}
            claveDe={(a) => a.ordenId}
          />
        )}
        {lineas.length > 0 && (apartadas ?? []).length > 0 ? (
          <p className="text-xs text-texto-sutil">
            Para retomar otra, primero cobra o aparta la que está en la pantalla.
          </p>
        ) : null}
      </section>
    </div>
  );
}
