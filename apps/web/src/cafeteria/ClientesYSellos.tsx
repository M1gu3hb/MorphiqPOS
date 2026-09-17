'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · clientes-y-sellos
 *
 * La tarjeta de sellos, que en una cafetería es el programa de lealtad entero.
 *
 * ── Por qué se identifica por TELÉFONO y no por tarjeta ─────────────────
 * Porque la tarjeta de cartón se pierde, y con ella el cliente pierde nueve
 * sellos y las ganas. El teléfono lo trae siempre y lo recuerda de memoria: es
 * el único identificador que sobrevive a tres meses.
 *
 * ── Por qué el saldo se enseña ANTES de cobrar ──────────────────────────
 * «Te falta uno» dicho en la barra vende el noveno café. Dicho después de
 * cobrar no vende nada, y el cliente se entera de que pudo haber canjeado
 * cuando ya pagó.
 *
 * ── Por qué el canje pide confirmación y el sello no ────────────────────
 * Dar un sello de más cuesta una fracción de café. Canjear por error cuesta un
 * café entero y una discusión, porque el cliente ya se llevó el suyo y su
 * tarjeta volvió a cero. No son el mismo riesgo y no llevan el mismo freno.
 *
 * ── Y por qué el ajuste manual pide MOTIVO ──────────────────────────────
 * Es la única forma de meter sellos sin venta, y sin motivo es exactamente
 * cómo se regalan cafés a los conocidos sin que nadie pueda verlo después.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben identificar, ver el saldo, canjear y ajustar. Queda fuera la campaña
 * de recordatorio, que necesita el canal de salida que está bloqueado.
 */

const RUTA_IDENTIFICAR = '/api/lealtad/identificar';
const RUTA_CANJEAR = '/api/lealtad/canjear';
const RUTA_AJUSTAR = '/api/lealtad/ajustar';

/** Diez dígitos, como se teclea en México. */
const TELEFONO_CON_FORMA = /^\d{10}$/;

export interface ClienteConSellos {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly sellos: number;
  readonly sellosParaPremio: number;
  readonly premiosCanjeados: number;
}

export interface ClientesYSellosProps {
  readonly clienteInicial?: ClienteConSellos;
  readonly recientesIniciales?: readonly ClienteConSellos[];
}

/** «Te falta uno» vende el noveno café; «llevas nueve» no dice nada. */
export function loQueFalta(cliente: ClienteConSellos): string {
  const faltan = cliente.sellosParaPremio - cliente.sellos;
  if (faltan <= 0) return 'Ya puede canjear';
  if (faltan === 1) return 'Le falta uno';
  return `Le faltan ${String(faltan)}`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

export function ClientesYSellos({ clienteInicial, recientesIniciales }: ClientesYSellosProps) {
  const voc = useVocabulario();
  const [telefono, setTelefono] = useState('');
  const [cliente, setCliente] = useState<ClienteConSellos | null>(clienteInicial ?? null);
  const [recientes, setRecientes] = useState<readonly ClienteConSellos[] | null>(
    recientesIniciales ?? null,
  );
  const [confirmandoCanje, setConfirmandoCanje] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ajuste, setAjuste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (recientesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      consultarPuente<ClienteConSellos>('Cliente', { limite: 12, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setRecientes(filas);
        })
        .catch(() => {
          if (sigueMontada()) setRecientes([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [recientesIniciales]);

  function identificar(): void {
    const limpio = telefono.replace(/\D/g, '');
    if (!TELEFONO_CON_FORMA.test(limpio)) {
      setError('El teléfono son diez dígitos.');
      return;
    }
    setOcupado(true);
    setError(null);
    setAviso(null);
    invocarComando<ClienteConSellos>(RUTA_IDENTIFICAR, { telefono: limpio })
      .then((encontrado) => {
        setCliente(encontrado);
        setConfirmandoCanje(false);
      })
      .catch((fallo: unknown) => {
        setCliente(null);
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function canjear(): void {
    if (cliente === null) return;
    setOcupado(true);
    setError(null);
    invocarComando<ClienteConSellos>(RUTA_CANJEAR, { clienteId: cliente.id })
      .then((actualizado) => {
        setCliente(actualizado);
        setConfirmandoCanje(false);
        setAviso('Canjeado. La tarjeta vuelve a empezar.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function ajustar(): void {
    if (cliente === null) return;
    const cantidad = Number(ajuste);
    if (!Number.isInteger(cantidad) || cantidad === 0) {
      setError('Pon cuántos sellos, en más o en menos.');
      return;
    }
    if (motivo.trim().length < 4) {
      // Sin motivo es exactamente cómo se regalan cafés a los conocidos sin que
      // nadie pueda verlo después.
      setError('Escribe por qué se ajusta.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<ClienteConSellos>(RUTA_AJUSTAR, {
      clienteId: cliente.id,
      sellos: cantidad,
      motivo: motivo.trim(),
    })
      .then((actualizado) => {
        setCliente(actualizado);
        setAjuste('');
        setMotivo('');
        setAviso('Ajustado.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{voc.titulo('cliente', true)} y sellos</h1>
        <p className="text-muted-foreground text-sm">
          Se identifica por teléfono: la tarjeta de cartón se pierde y el teléfono no.
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {aviso !== null && <p className="text-sm">{aviso}</p>}

      <section className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            inputMode="numeric"
            className="h-[calc(var(--altura-control)*1.4)] text-lg"
            placeholder="10 dígitos"
            value={telefono}
            onChange={(evento) => {
              setTelefono(evento.target.value);
            }}
          />
        </div>
        <Button
          className="h-[calc(var(--altura-control)*1.4)]"
          disabled={ocupado}
          onClick={identificar}
        >
          Buscar
        </Button>
      </section>

      {cliente !== null && (
        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="text-xl font-medium">{cliente.nombre}</h2>
            <p className="text-muted-foreground text-sm">{cliente.telefono ?? 'sin teléfono'}</p>
          </div>

          <div>
            <p className="text-3xl font-semibold tabular-nums">
              {cliente.sellos} / {cliente.sellosParaPremio}
            </p>
            <p className="text-lg">{loQueFalta(cliente)}</p>
            <p className="text-muted-foreground text-sm">
              {cliente.premiosCanjeados} premio{cliente.premiosCanjeados === 1 ? '' : 's'} canjeado
              {cliente.premiosCanjeados === 1 ? '' : 's'}
            </p>
          </div>

          {cliente.sellos >= cliente.sellosParaPremio && !confirmandoCanje && (
            <Button
              className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
              disabled={ocupado}
              onClick={() => {
                setConfirmandoCanje(true);
              }}
            >
              Canjear premio
            </Button>
          )}

          {confirmandoCanje && (
            <div className="space-y-2 rounded border p-3">
              <p className="text-sm">
                Al canjear, la tarjeta vuelve a cero. Canjear por error cuesta un café entero y una
                discusión.
              </p>
              <div className="flex gap-2">
                <Button
                  className="h-[calc(var(--altura-control)*1.2)] flex-1"
                  disabled={ocupado}
                  onClick={canjear}
                >
                  Sí, canjear
                </Button>
                <Button
                  variant="outline"
                  className="h-[calc(var(--altura-control)*1.2)] flex-1"
                  onClick={() => {
                    setConfirmandoCanje(false);
                  }}
                >
                  No
                </Button>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <h3 className="font-medium">Ajustar a mano</h3>
            <div className="flex gap-3">
              <div className="w-28">
                <Label htmlFor="ajuste">Sellos</Label>
                <Input
                  id="ajuste"
                  inputMode="numeric"
                  className="h-[calc(var(--altura-control)*1.2)] text-right"
                  placeholder="+1 / −1"
                  value={ajuste}
                  onChange={(evento) => {
                    setAjuste(evento.target.value);
                  }}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="motivo">Por qué</Label>
                <Input
                  id="motivo"
                  className="h-[calc(var(--altura-control)*1.2)]"
                  value={motivo}
                  onChange={(evento) => {
                    setMotivo(evento.target.value);
                  }}
                />
              </div>
            </div>
            <Button variant="outline" disabled={ocupado} onClick={ajustar}>
              Ajustar
            </Button>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-medium">Recientes</h2>
        {recientes === null && <Skeleton className="h-24 w-full" />}
        <ul className="divide-y">
          {(recientes ?? []).map((reciente) => (
            <li key={reciente.id} className="flex items-baseline justify-between py-2">
              <button
                type="button"
                className="text-left"
                onClick={() => {
                  setCliente(reciente);
                  setConfirmandoCanje(false);
                }}
              >
                {reciente.nombre}
              </button>
              <span className="text-muted-foreground text-sm tabular-nums">
                {reciente.sellos} / {reciente.sellosParaPremio}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
