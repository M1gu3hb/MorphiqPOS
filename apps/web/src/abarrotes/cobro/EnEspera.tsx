'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, Dinero, EsqueletoDeLista, Vacio } from '@morphiqpos/ui/sistema';
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
 * alguien que ya no volvió.
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

      <section aria-labelledby="apartadas-titulo" className="flex flex-col gap-(--espacio-2)">
        <h3 id="apartadas-titulo" className="text-sm font-medium text-texto-sutil">
          Apartadas en esta caja
        </h3>
        {apartadas === null && fallo === null ? (
          <EsqueletoDeLista filas={2} />
        ) : (apartadas ?? []).length === 0 ? (
          <Vacio icono={<Hourglass />} titulo="No hay nada apartado." />
        ) : (
          <ul className="flex flex-col gap-(--espacio-1)">
            {(apartadas ?? []).map((apartada) => (
              <li
                key={apartada.ordenId}
                className="flex items-center justify-between gap-(--espacio-2) rounded-md border border-borde px-(--espacio-3) py-(--espacio-2)"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    La {apartada.codigo}
                    {apartada.nota === null ? '' : ` · ${apartada.nota}`}
                  </span>
                  <span className="inline-flex items-baseline gap-(--espacio-1) text-xs text-texto-sutil">
                    {apartada.lineas} {apartada.lineas === 1 ? 'renglón' : 'renglones'} ·{' '}
                    <Dinero centavos={Number(apartada.totalCentavos)} tamano="sm" /> · hace{' '}
                    {apartada.minutosEsperando} min
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  // Retomar con una venta en la pantalla la pisaría: primero se cobra o se aparta.
                  disabled={enviando || lineas.length > 0}
                  onClick={() => {
                    void retomar(apartada.codigo);
                  }}
                >
                  Retomar
                </Button>
              </li>
            ))}
          </ul>
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
