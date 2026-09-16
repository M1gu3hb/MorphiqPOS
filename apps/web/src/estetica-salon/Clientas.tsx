'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · estetica-salon · clientas
 *
 * La ficha y el expediente: lo que hay que saber ANTES de tocar a alguien.
 *
 * ── Por qué las alergias van arriba de todo y en rojo ───────────────────
 * Porque es el único dato de esta pantalla que puede mandar a alguien al
 * hospital. Enterrarlo en una pestaña de «datos médicos» es tenerlo sin usar:
 * nadie abre una pestaña con la clienta ya sentada y el tinte mezclándose.
 *
 * ── Por qué el hueco en blanco NO es «no tiene» ─────────────────────────
 * «Se preguntó y no había» y «nadie preguntó» son cosas distintas y sólo una es
 * una decisión. La pantalla señala lo que falta por contestar, uno por uno,
 * porque «falta algo» manda a la recepcionista a buscar qué mientras la clienta
 * espera.
 *
 * ── Por qué el botón REPETIR existe ─────────────────────────────────────
 * Es lo que convierte la captura del expediente en un toque. Trae la fórmula
 * congelada y los días que han pasado: «este tono hace cinco semanas» y «hace
 * ocho meses» no se repiten igual, y quien está mezclando no tiene tiempo de
 * restar fechas.
 *
 * ── Por qué «le toca volver» vive aquí y no en un reporte ───────────────
 * Porque se llama desde el mostrador, entre clienta y clienta, con el teléfono
 * en la mano. Un reporte que hay que ir a abrir es un reporte que no se abre.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben buscar, la ficha, el expediente con sus huecos, la última fórmula y a
 * quién le toca volver. Quedan fuera las fotos, que cuelgan del servicio.
 */

const RUTA_EXPEDIENTE = '/api/clientes';
const RUTA_POR_VOLVER = '/api/clientes/por-volver';
const RUTA_ALTA = '/api/clientes';

export interface FichaDeClienta {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
}

export interface Expediente {
  readonly clienteId: string;
  readonly alergias: string;
  readonly antecedentes: string;
  readonly comoLlego: string;
  readonly queBusca: string;
  readonly tipoCabello: string | null;
  readonly porcentajeCanas: number | null;
  readonly frecuenciaDias: number | null;
  readonly esPrimeraVisita: boolean;
  readonly sinContestar: readonly string[];
}

export interface FormulaAnterior {
  readonly formulaId: string;
  readonly formula: unknown;
  readonly resultado: string | null;
  readonly aplicadaEn: string;
  readonly diasDesde: number;
}

export interface ClientaPorVolver {
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly diasDeRetraso: number;
}

export interface ClientasProps {
  readonly clientasIniciales?: readonly FichaDeClienta[];
  readonly porVolverIniciales?: readonly ClientaPorVolver[];
}

/** Los cuatro campos del expediente, con el nombre que se lee en pantalla. */
const CAMPOS = [
  { clave: 'alergias', etiqueta: 'Alergias' },
  { clave: 'antecedentes', etiqueta: 'Antecedentes' },
  { clave: 'como_llego', etiqueta: 'Cómo llegó' },
  { clave: 'que_busca', etiqueta: 'Qué busca' },
] as const;

export function nombreDelHueco(clave: string): string {
  return CAMPOS.find((campo) => campo.clave === clave)?.etiqueta ?? clave;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar. Lo capturado sigue aquí.';
}

export function Clientas({ clientasIniciales, porVolverIniciales }: ClientasProps) {
  const [clientas, setClientas] = useState<readonly FichaDeClienta[] | null>(
    clientasIniciales ?? null,
  );
  const [porVolver, setPorVolver] = useState<readonly ClientaPorVolver[] | null>(
    porVolverIniciales ?? null,
  );
  const [busqueda, setBusqueda] = useState('');
  const [elegida, setElegida] = useState<FichaDeClienta | null>(null);
  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [ultima, setUltima] = useState<FormulaAnterior | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (clientasIniciales !== undefined && porVolverIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      if (clientasIniciales === undefined) {
        consultarPuente<FichaDeClienta>('Cliente', { limite: 200, signal: control.signal })
          .then((filas) => {
            if (sigueMontada()) setClientas(filas);
          })
          .catch(() => {
            if (sigueMontada()) setClientas([]);
          });
      }
      if (porVolverIniciales === undefined) {
        invocarComando<{ readonly clientas: readonly ClientaPorVolver[] }>(RUTA_POR_VOLVER, {})
          .then((salida) => {
            if (sigueMontada()) setPorVolver(salida.clientas);
          })
          .catch(() => {
            if (sigueMontada()) setPorVolver([]);
          });
      }
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [clientasIniciales, porVolverIniciales]);

  function abrir(clienta: FichaDeClienta): void {
    setElegida(clienta);
    setExpediente(null);
    setUltima(null);
    setBorrador({});
    setError(null);

    invocarComando<Expediente>(`${RUTA_EXPEDIENTE}/${clienta.id}/expediente`, {})
      .then((datos) => {
        setExpediente(datos);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      });

    invocarComando<{ readonly ultima: FormulaAnterior | null }>(
      `${RUTA_EXPEDIENTE}/${clienta.id}/ultima-formula`,
      {},
    )
      .then((salida) => {
        setUltima(salida.ultima);
      })
      .catch(() => {
        setUltima(null);
      });
  }

  function guardar(): void {
    if (elegida === null) return;
    setOcupado(true);
    setError(null);
    invocarComando<Expediente>(`${RUTA_EXPEDIENTE}/${elegida.id}/expediente`, {
      // Sólo lo que se tocó. Mandar el formulario entero desde la pantalla que
      // sólo quería corregir las canas borraría las alergias.
      ...(borrador['alergias'] === undefined ? {} : { alergias: borrador['alergias'] }),
      ...(borrador['antecedentes'] === undefined ? {} : { antecedentes: borrador['antecedentes'] }),
      ...(borrador['como_llego'] === undefined ? {} : { comoLlego: borrador['como_llego'] }),
      ...(borrador['que_busca'] === undefined ? {} : { queBusca: borrador['que_busca'] }),
    })
      .then((datos) => {
        setExpediente(datos);
        setBorrador({});
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function darDeAlta(): void {
    const nombre = busqueda.trim();
    if (nombre === '') return;
    setOcupado(true);
    invocarComando<FichaDeClienta>(RUTA_ALTA, { nombre, telefono: null })
      .then((creada) => {
        setClientas([creada, ...(clientas ?? [])]);
        abrir(creada);
        setBusqueda('');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (clientas === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const filtro = busqueda.trim().toLowerCase();
  const visibles =
    filtro === ''
      ? clientas.slice(0, 40)
      : clientas.filter(
          (c) => c.nombre.toLowerCase().includes(filtro) || (c.telefono ?? '').includes(filtro),
        );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-[20rem_1fr]">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Clientas</h1>
        <div>
          <Label htmlFor="buscar">Buscar</Label>
          <Input
            id="buscar"
            className="h-[calc(var(--altura-control)*1.2)]"
            placeholder="nombre o teléfono"
            value={busqueda}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
          />
        </div>
        {filtro !== '' && visibles.length === 0 && (
          <Button variant="outline" className="w-full" disabled={ocupado} onClick={darDeAlta}>
            Dar de alta «{busqueda.trim()}»
          </Button>
        )}
        <ul className="divide-y">
          {visibles.map((clienta) => (
            <li key={clienta.id}>
              <button
                type="button"
                className={`w-full py-2 text-left ${elegida?.id === clienta.id ? 'font-medium' : ''}`}
                onClick={() => {
                  abrir(clienta);
                }}
              >
                {clienta.nombre}
                <span className="text-muted-foreground ml-2 text-xs">{clienta.telefono ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>

        <Separator />

        <h2 className="font-medium">Les toca volver</h2>
        {porVolver === null && <Skeleton className="h-[calc(var(--altura-control)*2)] w-full" />}
        {porVolver !== null && porVolver.length === 0 && (
          <p className="text-muted-foreground text-sm">Nadie va con retraso.</p>
        )}
        <ul className="divide-y">
          {(porVolver ?? []).slice(0, 10).map((clienta) => (
            <li key={clienta.clienteId} className="flex items-baseline justify-between py-2">
              <span>{clienta.nombre}</span>
              <span className="text-muted-foreground text-sm">
                {clienta.diasDeRetraso} d de retraso
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        {elegida === null && (
          <p className="text-muted-foreground">Elige una clienta para abrir su expediente.</p>
        )}

        {elegida !== null && expediente === null && <Skeleton className="h-64 w-full" />}

        {elegida !== null && expediente !== null && (
          <>
            <div>
              <h2 className="text-xl font-medium">{elegida.nombre}</h2>
              {expediente.esPrimeraVisita && (
                <p className="text-sm">Primera visita: hay que preguntarlo todo.</p>
              )}
            </div>

            {/* Arriba de todo y en rojo: es el único dato de esta pantalla que
                puede mandar a alguien al hospital. */}
            <div className="border-destructive rounded-lg border-2 p-4">
              <Label htmlFor="alergias" className="text-destructive text-base font-semibold">
                Alergias
              </Label>
              <Textarea
                id="alergias"
                className="mt-1"
                rows={2}
                value={borrador['alergias'] ?? expediente.alergias}
                onChange={(evento) => {
                  setBorrador({ ...borrador, alergias: evento.target.value });
                }}
              />
              {expediente.alergias.trim() === '' && (
                <p className="text-destructive mt-1 text-sm">
                  Sin contestar. «Ninguna conocida» también es una respuesta.
                </p>
              )}
            </div>

            {CAMPOS.filter((campo) => campo.clave !== 'alergias').map((campo) => (
              <div key={campo.clave}>
                <Label htmlFor={campo.clave}>{campo.etiqueta}</Label>
                <Textarea
                  id={campo.clave}
                  rows={2}
                  value={
                    borrador[campo.clave] ??
                    (campo.clave === 'antecedentes'
                      ? expediente.antecedentes
                      : campo.clave === 'como_llego'
                        ? expediente.comoLlego
                        : expediente.queBusca)
                  }
                  onChange={(evento) => {
                    setBorrador({ ...borrador, [campo.clave]: evento.target.value });
                  }}
                />
              </div>
            ))}

            {expediente.sinContestar.length > 0 && (
              <p className="text-sm">
                Falta por contestar: {expediente.sinContestar.map(nombreDelHueco).join(', ')}.
              </p>
            )}

            <Button
              className="h-[calc(var(--altura-control)*1.4)]"
              disabled={ocupado}
              onClick={guardar}
            >
              Guardar expediente
            </Button>

            <Separator />

            <div>
              <h3 className="font-medium">Última fórmula</h3>
              {ultima === null && (
                <p className="text-muted-foreground text-sm">Todavía no hay ninguna.</p>
              )}
              {ultima !== null && (
                <>
                  <p className="text-sm">
                    Hace {ultima.diasDesde} día{ultima.diasDesde === 1 ? '' : 's'}
                    {ultima.resultado === null ? '' : ` · ${ultima.resultado}`}
                  </p>
                  <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-sm">
                    {JSON.stringify(ultima.formula, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
