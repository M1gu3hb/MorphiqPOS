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

// Identificar por teléfono es una LECTURA y va por el puente: la ruta
// `/api/lealtad/identificar` sirve `lealtad.otorgar_sellos`, que es otra cosa.
const RUTA_CANJEAR = '/api/lealtad/canjear';
const RUTA_AJUSTAR = '/api/lealtad/ajustar';

/** Diez dígitos, como se teclea en México. */
const TELEFONO_CON_FORMA = /^\d{10}$/;

/** Lo mínimo de un producto para poder ofrecerlo como premio. */
export interface PremioPosible {
  readonly id: string;
  readonly nombre: string;
}

export interface ClienteConSellos {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly sellos: number;
  /**
   * Cuántos sellos son un premio. NO es del cliente: es del NEGOCIO.
   *
   * No se sirve por cliente y no debería: es una regla de lealtad, la misma para
   * todos, y vive en la configuración. Se declara opcional y la pantalla cae al
   * valor por omisión —diez, que es la tarjeta de cartón de toda la vida— en vez de
   * restar contra `undefined` y enseñar «NaN para tu próximo café».
   */
  readonly sellosParaPremio?: number;
  readonly premiosCanjeados: number;
}

export interface ClientesYSellosProps {
  readonly clienteInicial?: ClienteConSellos;
  readonly recientesIniciales?: readonly ClienteConSellos[];
}

/** Diez sellos son un café: es la tarjeta de cartón de toda la vida. */
const SELLOS_PARA_PREMIO = 10;

/**
 * Cuántos sellos son un premio en ESTE negocio.
 *
 * El umbral no es del cliente —es una regla de lealtad, la misma para todos— y el
 * puente no lo sirve por cliente, con razón. Con el valor por omisión la tarjeta
 * dice «3 / 10» en vez de «3 / NaN», que es lo que enseñaba.
 */
export function metaDeSellos(cliente: { readonly sellosParaPremio?: number }): number {
  return cliente.sellosParaPremio ?? SELLOS_PARA_PREMIO;
}

/** «Te falta uno» vende el noveno café; «llevas nueve» no dice nada. */
export function loQueFalta(cliente: ClienteConSellos): string {
  const faltan = metaDeSellos(cliente) - cliente.sellos;
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
  /** El premio que se lleva. Lo pide el comando: congela su costo en el ledger. */
  const [premio, setPremio] = useState('');
  const [premios, setPremios] = useState<readonly PremioPosible[] | null>(null);
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
      // Lo que se puede dar como premio. Hace falta AQUÍ porque el canje anota el
      // costo del producto que se entrega, y ese costo se congela en el ledger.
      consultarPuente<PremioPosible>('ProductoTerminado', {
        filtro: { activo: true },
        orden: 'nombre',
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setPremios(filas);
        })
        .catch(() => {
          if (sigueMontada()) setPremios([]);
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
    /**
     * ── IDENTIFICAR NUNCA FUNCIONÓ, y es lo PRIMERO que hace esta pantalla ──
     * Publicaba `{telefono}` en `/api/lealtad/identificar`, que es el comando
     * `lealtad.otorgar_sellos` y pide `{clienteId, ordenId}`: cada búsqueda
     * contestaba **400** y la tarjeta de sellos no se podía abrir nunca. La ruta ni
     * identifica ni debería: buscar por teléfono es una LECTURA, y las lecturas van
     * por el puente —que además ya sirve los `sellos` derivados del ledger—.
     */
    consultarPuente<ClienteConSellos>('Cliente', { filtro: { telefono: limpio }, limite: 1 })
      .then((filas) => {
        const encontrado = filas[0];
        if (encontrado === undefined) {
          setCliente(null);
          setError('Con ese teléfono no hay nadie registrado todavía.');
          return;
        }
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
    if (premio === '') {
      setError('Elige qué se lleva: el premio se anota con su costo congelado.');
      return;
    }
    /**
     * EL PREMIO VIAJA, porque `lealtad.canjear` congela su COSTO en el movimiento.
     * Antes iba sólo `{clienteId}` y contestaba 400: se podía confirmar el canje y
     * la tarjeta no se vaciaba —ni el premio se anotaba— nunca.
     */
    invocarComando<ClienteConSellos>(RUTA_CANJEAR, { clienteId: cliente.id, productoId: premio })
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
    <main className="mx-auto max-w-2xl space-y-(--espacio-6) p-(--espacio-6)">
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

      <section className="flex items-end gap-(--espacio-3)">
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
        <section className="space-y-(--espacio-4) rounded-lg border p-(--espacio-4)">
          <div>
            <h2 className="text-xl font-medium">{cliente.nombre}</h2>
            <p className="text-muted-foreground text-sm">{cliente.telefono ?? 'sin teléfono'}</p>
          </div>

          <div>
            <p className="text-3xl font-semibold tabular-nums">
              {cliente.sellos} / {metaDeSellos(cliente)}
            </p>
            <p className="text-lg">{loQueFalta(cliente)}</p>
            <p className="text-muted-foreground text-sm">
              {cliente.premiosCanjeados} premio{cliente.premiosCanjeados === 1 ? '' : 's'} canjeado
              {cliente.premiosCanjeados === 1 ? '' : 's'}
            </p>
          </div>

          {cliente.sellos >= metaDeSellos(cliente) && !confirmandoCanje && (
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
            <div className="space-y-2 rounded border p-(--espacio-3)">
              <p className="text-sm">
                Al canjear, la tarjeta vuelve a cero. Canjear por error cuesta un café entero y una
                discusión.
              </p>
              {/*
                QUÉ SE LLEVA. No es un adorno: `lealtad.canjear` congela el COSTO del
                producto en el movimiento —el premio de hace un año se valuó con el
                costo de hace un año— y sin producto el comando contesta 400. Antes no
                se preguntaba, y el canje no se podía hacer nunca.
              */}
              <div>
                <Label htmlFor="premio">Qué se lleva</Label>
                <select
                  id="premio"
                  className="h-(--altura-control) w-full rounded-md border border-input bg-background px-(--espacio-3) text-base"
                  value={premio}
                  onChange={(evento) => {
                    setPremio(evento.target.value);
                  }}
                >
                  <option value="">Elige el premio…</option>
                  {(premios ?? []).map((posible) => (
                    <option key={posible.id} value={posible.id}>
                      {posible.nombre}
                    </option>
                  ))}
                </select>
              </div>
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
            <div className="flex gap-(--espacio-3)">
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
