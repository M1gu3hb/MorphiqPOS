'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, EsqueletoDeLista, Vacio } from '@morphiqpos/ui/sistema';
import { HardHat, UserCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

/**
 * LAS OBRAS DEL CLIENTE Y QUIÉN PUEDE RECOGER POR ÉL (F-638, F-639; C.10 de la 2.4).
 *
 * La cabecera de Cuentas decía que esto «vive en la ficha completa del cliente», y esa
 * ficha no existía: los comandos (`credito.crear_obra`, `cerrar_obra`,
 * `alta_autorizado`, `baja_autorizado`) no tenían pantalla, así que el mostrador
 * nunca sabía si el que venía por el material estaba en la lista. Aquí se dan de alta,
 * se cierran y se dan de baja, en la ficha del cliente de la cartera.
 */

interface Obra {
  readonly id: string;
  readonly nombre: string;
  readonly estado: string | null;
}

interface Autorizado {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly obra_id: string | null;
  readonly activo: boolean | null;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.error.mensaje;
  return fallo instanceof Error ? fallo.message : 'No se pudo hablar con el servidor.';
}

export function ObrasYQuienRecoge({ clienteId }: { readonly clienteId: string }) {
  const [obras, setObras] = useState<readonly Obra[] | null>(null);
  const [autorizados, setAutorizados] = useState<readonly Autorizado[] | null>(null);
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [lectura, setLectura] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nombreDeObra, setNombreDeObra] = useState('');
  const [nombreDeAutorizado, setNombreDeAutorizado] = useState('');
  const [telefono, setTelefono] = useState('');
  const [obraDelAutorizado, setObraDelAutorizado] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    Promise.all([
      consultarPuente<Obra>('Obra', {
        filtro: { cliente_id: clienteId },
        limite: 50,
        signal: control.signal,
      }),
      consultarPuente<Autorizado>('AutorizadoCuenta', {
        filtro: { cliente_id: clienteId },
        limite: 50,
        signal: control.signal,
      }),
    ])
      .then(([leidas, personas]) => {
        if (control.signal.aborted) return;
        setObras(leidas);
        setAutorizados(personas.filter((p) => p.activo !== false));
        setFalloDeLectura(null);
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) setFalloDeLectura(mensajeDe(error));
      });
    return () => {
      control.abort();
    };
  }, [clienteId, lectura]);

  async function escribir(
    clave: string,
    ruta: string,
    cuerpo: Record<string, unknown>,
  ): Promise<boolean> {
    setOcupado(clave);
    setFallo(null);
    try {
      await invocarComando(ruta, cuerpo);
      setLectura((previa) => previa + 1);
      return true;
    } catch (error) {
      setFallo(mensajeDe(error));
      return false;
    } finally {
      setOcupado(null);
    }
  }

  if (falloDeLectura !== null) {
    return (
      <Aviso tono="peligro" titulo="No se pudieron leer las obras ni quién recoge.">
        {falloDeLectura}
      </Aviso>
    );
  }
  if (obras === null || autorizados === null) return <EsqueletoDeLista filas={2} />;

  const abiertas = obras.filter((o) => o.estado !== 'cerrada');
  const nombreDe = (obraId: string | null) =>
    obraId === null ? 'cualquier obra' : (obras.find((o) => o.id === obraId)?.nombre ?? 'una obra');

  return (
    <section aria-labelledby="obras-y-quien-recoge" className="flex flex-col gap-(--espacio-3)">
      <h3
        id="obras-y-quien-recoge"
        className="flex items-center gap-(--espacio-2) text-sm font-semibold"
      >
        <HardHat aria-hidden="true" className="size-4 shrink-0" />
        Obras y quién recoge
      </h3>

      <ul aria-label="Obras abiertas" className="flex flex-col gap-(--espacio-1)">
        {abiertas.length === 0 ? (
          <li>
            <Vacio
              titulo="Sin obras abiertas."
              explicacion="Se le remite a su cuenta general; con una obra, el saldo se lleva por obra."
              className="items-start py-(--espacio-2) text-left"
            />
          </li>
        ) : (
          abiertas.map((obra) => (
            <li
              key={obra.id}
              className="flex items-center justify-between gap-(--espacio-2) text-sm"
            >
              <span className="font-medium">{obra.nombre}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                cargando={ocupado === obra.id}
                disabled={ocupado !== null}
                onClick={() =>
                  void escribir(obra.id, '/api/credito/obra-cerrar', { obraId: obra.id })
                }
              >
                Cerrar obra
              </Button>
            </li>
          ))
        )}
      </ul>
      <form
        className="flex flex-wrap items-end gap-(--espacio-2)"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (nombreDeObra.trim().length < 2) return;
          void escribir('obra', '/api/credito/obra', {
            clienteId,
            nombre: nombreDeObra.trim(),
          }).then((bien) => {
            if (bien) setNombreDeObra('');
          });
        }}
      >
        <div className="flex min-w-40 flex-1 flex-col gap-(--espacio-1)">
          <Label htmlFor={`obra-nueva-${clienteId}`}>Obra nueva</Label>
          <Input
            id={`obra-nueva-${clienteId}`}
            value={nombreDeObra}
            placeholder="Torre B, Las Palmas"
            onChange={(evento) => {
              setNombreDeObra(evento.target.value);
            }}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={ocupado !== null || nombreDeObra.trim().length < 2}
        >
          Abrir obra
        </Button>
      </form>

      <ul aria-label="Quién puede recoger" className="flex flex-col gap-(--espacio-1)">
        {autorizados.length === 0 ? (
          <li>
            <Vacio
              titulo="Nadie en la lista."
              explicacion="El mostrador preguntará antes de despachar a quien llegue por el material."
              className="items-start py-(--espacio-2) text-left"
            />
          </li>
        ) : (
          autorizados.map((persona) => (
            <li
              key={persona.id}
              className="flex items-center justify-between gap-(--espacio-2) text-sm"
            >
              <span className="flex items-center gap-(--espacio-2)">
                <UserCheck aria-hidden="true" className="size-4 shrink-0 text-exito" />
                <span className="font-medium">{persona.nombre}</span>
                <span className="text-texto-sutil">· {nombreDe(persona.obra_id)}</span>
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Dar de baja a ${persona.nombre}`}
                cargando={ocupado === persona.id}
                disabled={ocupado !== null}
                onClick={() =>
                  void escribir(persona.id, '/api/credito/autorizado-baja', {
                    autorizadoId: persona.id,
                  })
                }
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))
        )}
      </ul>
      <form
        className="flex flex-wrap items-end gap-(--espacio-2)"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (nombreDeAutorizado.trim().length < 2) return;
          void escribir('autorizado', '/api/credito/autorizado', {
            clienteId,
            nombre: nombreDeAutorizado.trim(),
            ...(telefono.trim() === '' ? {} : { telefono: telefono.trim() }),
            ...(obraDelAutorizado === null ? {} : { obraId: obraDelAutorizado }),
          }).then((bien) => {
            if (!bien) return;
            setNombreDeAutorizado('');
            setTelefono('');
          });
        }}
      >
        <div className="flex min-w-40 flex-1 flex-col gap-(--espacio-1)">
          <Label htmlFor={`autorizado-${clienteId}`}>Puede recoger</Label>
          <Input
            id={`autorizado-${clienteId}`}
            value={nombreDeAutorizado}
            placeholder="Nombre de quien viene por el material"
            onChange={(evento) => {
              setNombreDeAutorizado(evento.target.value);
            }}
          />
        </div>
        <div className="flex w-36 flex-col gap-(--espacio-1)">
          <Label htmlFor={`autorizado-tel-${clienteId}`}>Teléfono</Label>
          <Input
            id={`autorizado-tel-${clienteId}`}
            inputMode="tel"
            value={telefono}
            onChange={(evento) => {
              setTelefono(evento.target.value);
            }}
          />
        </div>
        {abiertas.length > 0 && (
          <div role="group" aria-label="Para qué obra" className="flex flex-wrap gap-(--espacio-1)">
            {[{ id: null, nombre: 'Cualquiera' }, ...abiertas].map((obra) => (
              <Button
                key={obra.id ?? 'cualquiera'}
                type="button"
                size="sm"
                variant={obraDelAutorizado === obra.id ? 'default' : 'outline'}
                aria-pressed={obraDelAutorizado === obra.id}
                onClick={() => {
                  setObraDelAutorizado(obra.id);
                }}
              >
                {obra.nombre}
              </Button>
            ))}
          </div>
        )}
        <Button
          type="submit"
          variant="secondary"
          disabled={ocupado !== null || nombreDeAutorizado.trim().length < 2}
        >
          Agregar a la lista
        </Button>
      </form>
      {fallo !== null && (
        <Aviso tono="peligro" titulo={fallo}>
          No se cambió nada.
        </Aviso>
      )}
    </section>
  );
}
