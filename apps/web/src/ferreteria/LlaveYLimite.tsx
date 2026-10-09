'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { Aviso, CampoDeDinero, Dinero } from '@morphiqpos/ui/sistema';
import { KeyRound, Scale } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando, obtenerApi } from '~/cliente/api';
import { rutaDeEmpleados } from '~/cliente/entrada';

/**
 * LA LLAVE DEL DUEÑO Y EL LÍMITE, en la ficha del cliente (C.10 de la 2.4).
 *
 * El mostrador decía «pasa del límite» y la mora bloqueaba, pero no había dónde dar la
 * llave (`credito.autorizar`) ni dónde fijar el límite: el comando del límite ni
 * existía (`credito.fijar_limite`). Los dos los hace quien responde por el dinero, con
 * SU usuario y con motivo; quien no puede, lo lee dicho en vez de un botón muerto.
 */

const VIGENCIAS = [
  { horas: 4, etiqueta: '4 horas' },
  { horas: 8, etiqueta: 'Hoy (8 h)' },
  { horas: 24, etiqueta: '24 horas' },
] as const;

/** «ok» no es un motivo: el servidor pide diez letras y aquí se dice antes. */
const MINIMO_DE_MOTIVO = 10;

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.error.codigo === 'SIN_PERMISO' || fallo.estado === 403) {
      return 'Sólo el dueño o el administrador, con su usuario.';
    }
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo hablar con el servidor.';
}

/** Quien puede pedir la llave: la gente del negocio, como la lista la entrada. */
interface Persona {
  readonly empleoId: string;
  readonly nombre: string;
  readonly rol: string;
}

interface Autorizacion {
  readonly importeCentavos: string;
  readonly venceEn: string;
  readonly autorizacionesRecientes: number;
}

export function LlaveDelDueno({ clienteId }: { readonly clienteId: string }) {
  const [importe, setImporte] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [horas, setHoras] = useState<number>(8);
  /** A QUIÉN se le da: la base exige que no sea quien la da. */
  const [gente, setGente] = useState<readonly Persona[]>([]);
  const [pide, setPide] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [dada, setDada] = useState<Autorizacion | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const listo =
    pide !== null && importe !== null && importe > 0 && motivo.trim().length >= MINIMO_DE_MOTIVO;

  useEffect(() => {
    const control = new AbortController();
    obtenerApi<{ readonly empleados: readonly Persona[] }>(rutaDeEmpleados(), control.signal)
      .then((datos) => {
        if (!control.signal.aborted) setGente(datos.empleados);
      })
      // Sin la lista no se puede elegir a quién: el botón queda apagado y lo dice.
      .catch(() => undefined);
    return () => {
      control.abort();
    };
  }, []);

  async function dar(): Promise<void> {
    if (!listo) return;
    setEnviando(true);
    setFallo(null);
    try {
      setDada(
        await invocarComando<Autorizacion>('/api/credito/autorizar', {
          solicitaEmpleoId: pide,
          clienteId,
          importeCentavos: importe,
          motivo: motivo.trim(),
          vigenciaHoras: horas,
        }),
      );
      setMotivo('');
      setImporte(null);
    } catch (error) {
      setFallo(mensajeDe(error));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-labelledby="llave-del-dueno" className="flex flex-col gap-(--espacio-2)">
      <h3
        id="llave-del-dueno"
        className="flex items-center gap-(--espacio-2) text-sm font-semibold"
      >
        <KeyRound aria-hidden="true" className="size-4 shrink-0" />
        La llave del dueño
      </h3>
      <p className="text-xs text-texto-sutil">
        Para UNA salida que el muro detiene: por este importe, por unas horas y para QUIEN la pide
        —nadie se la da a sí mismo—. Queda quién la dio y por qué.
      </p>
      <div className="flex flex-wrap items-end gap-(--espacio-2)">
        <div className="flex w-36 flex-col gap-(--espacio-1)">
          <Label htmlFor={`llave-importe-${clienteId}`}>Por cuánto</Label>
          <CampoDeDinero
            id={`llave-importe-${clienteId}`}
            centavos={importe}
            alCambiar={setImporte}
          />
        </div>
        <div role="group" aria-label="Cuánto dura" className="flex flex-wrap gap-(--espacio-1)">
          {VIGENCIAS.map((v) => (
            <Button
              key={v.horas}
              type="button"
              size="sm"
              variant={horas === v.horas ? 'default' : 'outline'}
              aria-pressed={horas === v.horas}
              onClick={() => {
                setHoras(v.horas);
              }}
            >
              {v.etiqueta}
            </Button>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Quién la pide" className="flex flex-wrap gap-(--espacio-1)">
        {gente.length === 0 ? (
          <span className="text-xs text-texto-sutil">
            Sin la lista del equipo no se puede elegir a quién se le da.
          </span>
        ) : (
          gente.map((persona) => (
            <Button
              key={persona.empleoId}
              type="button"
              size="sm"
              variant={pide === persona.empleoId ? 'default' : 'outline'}
              aria-pressed={pide === persona.empleoId}
              onClick={() => {
                setPide(persona.empleoId);
              }}
            >
              {persona.nombre}
            </Button>
          ))
        )}
      </div>
      <Label htmlFor={`llave-motivo-${clienteId}`}>Por qué</Label>
      <Textarea
        id={`llave-motivo-${clienteId}`}
        rows={2}
        value={motivo}
        placeholder="Paga el viernes: trae el cheque de la obra"
        onChange={(evento) => {
          setMotivo(evento.target.value);
        }}
      />
      <Button
        type="button"
        disabled={!listo || enviando}
        cargando={enviando}
        onClick={() => void dar()}
      >
        Dar la llave
      </Button>
      {dada !== null && (
        <Aviso tono="exito" titulo="Llave dada.">
          Por <Dinero centavos={Number(dada.importeCentavos)} tamano="sm" />, hasta las{' '}
          {new Date(dada.venceEn).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          .
          {dada.autorizacionesRecientes > 1
            ? ` Van ${String(dada.autorizacionesRecientes)} con este cliente en dos meses.`
            : ''}
        </Aviso>
      )}
      {fallo !== null && (
        <Aviso tono="peligro" titulo={fallo}>
          No se dio ninguna llave.
        </Aviso>
      )}
    </section>
  );
}

export function LimiteDeCredito({
  clienteId,
  limiteCentavos,
  alFijar,
}: {
  readonly clienteId: string;
  readonly limiteCentavos: number;
  readonly alFijar: (limiteCentavos: number) => void;
}) {
  const [nuevo, setNuevo] = useState<number | null>(limiteCentavos === 0 ? null : limiteCentavos);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [fijado, setFijado] = useState(false);
  const listo = nuevo !== null && nuevo !== limiteCentavos && motivo.trim().length >= 4;

  async function fijar(): Promise<void> {
    if (!listo) return;
    setEnviando(true);
    setFallo(null);
    setFijado(false);
    try {
      await invocarComando('/api/credito/limite-credito', {
        clienteId,
        limiteCentavos: nuevo,
        motivo: motivo.trim(),
      });
      setMotivo('');
      setFijado(true);
      alFijar(nuevo);
    } catch (error) {
      setFallo(mensajeDe(error));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-labelledby="limite-de-credito" className="flex flex-col gap-(--espacio-2)">
      <h3
        id="limite-de-credito"
        className="flex items-center gap-(--espacio-2) text-sm font-semibold"
      >
        <Scale aria-hidden="true" className="size-4 shrink-0" />
        El límite de crédito
      </h3>
      <div className="flex flex-wrap items-end gap-(--espacio-2)">
        <div className="flex w-40 flex-col gap-(--espacio-1)">
          <Label htmlFor={`limite-${clienteId}`}>Límite</Label>
          <CampoDeDinero id={`limite-${clienteId}`} centavos={nuevo} alCambiar={setNuevo} />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-(--espacio-1)">
          <Label htmlFor={`limite-motivo-${clienteId}`}>Por qué</Label>
          <Textarea
            id={`limite-motivo-${clienteId}`}
            rows={1}
            value={motivo}
            onChange={(evento) => {
              setMotivo(evento.target.value);
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!listo || enviando}
          cargando={enviando}
          onClick={() => void fijar()}
        >
          Fijar límite
        </Button>
      </div>
      {fijado && (
        <p role="status" className="text-xs text-texto-sutil">
          Límite fijado; queda en la bitácora con su motivo.
        </p>
      )}
      {fallo !== null && (
        <Aviso tono="peligro" titulo={fallo}>
          El límite no cambió.
        </Aviso>
      )}
    </section>
  );
}
