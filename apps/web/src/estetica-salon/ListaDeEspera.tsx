'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Cifra,
  EsqueletoDeLista,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import { enlaceDeAviso, ventanaEnPalabras, type EsperaViva } from './lista-de-espera.ts';

/**
 * LA LISTA DE ESPERA, en el panel de la agenda (F-409; C.10 de la 2.4).
 *
 * Quién espera un lugar, qué y cuándo le vale. AVISAR abre el WhatsApp de quien atiende
 * con el mensaje escrito —el sistema no manda mensajes solo: el proveedor es F-406, del
 * §10— y deja la espera marcada como avisada. AGENDAR lleva a Agendar con la clienta ya
 * elegida y ata la espera a la cita. YA NO la cancela.
 */
export function ListaDeEspera() {
  const voc = useVocabulario();
  const [esperas, setEsperas] = useState<readonly EsperaViva[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [lectura, setLectura] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    invocarComando<{ readonly esperas: readonly EsperaViva[] }>(
      '/api/lista-espera/viva',
      {},
      { signal: control.signal },
    )
      .then((salida) => {
        if (!control.signal.aborted) setEsperas(salida.esperas);
      })
      .catch((error: unknown) => {
        if (control.signal.aborted) return;
        setFallo(error instanceof ErrorApi ? error.message : 'No se pudo leer la lista de espera.');
      });
    return () => {
      control.abort();
    };
  }, [lectura]);

  function marcar(espera: EsperaViva, accion: 'avisar' | 'cancelar'): void {
    setOcupada(espera.esperaId);
    invocarComando(`/api/lista-espera/${espera.esperaId}/${accion}`, {})
      .then(() => {
        setLectura((n) => n + 1);
      })
      .catch((error: unknown) => {
        setFallo(error instanceof ErrorApi ? error.message : 'No se pudo cambiar la espera.');
      })
      .finally(() => {
        setOcupada(null);
      });
  }

  const columnas: readonly ColumnaDeTabla<EsperaViva>[] = [
    {
      clave: 'quien',
      titulo: voc.titulo('cliente'),
      celda: (e) => (
        <span className="flex flex-col">
          <span className="font-medium">{e.clienteNombre}</span>
          <span className="text-xs text-texto-sutil">
            {e.servicioNombre ?? 'cualquier servicio'} · {ventanaEnPalabras(e)}
          </span>
          {e.estado === 'avisada' ? <span className="text-xs font-medium">ya avisada</span> : null}
        </span>
      ),
    },
    {
      clave: 'acciones',
      titulo: '',
      celda: (e) => {
        const enlace = enlaceDeAviso(e);
        return (
          <span className="flex flex-wrap justify-end gap-(--espacio-1)">
            {enlace === null ? null : (
              <Button asChild size="sm" variant="outline">
                <a
                  href={enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    marcar(e, 'avisar');
                  }}
                >
                  <MessageCircle aria-hidden="true" />
                  Avisar<span className="sr-only"> a {e.clienteNombre}</span>
                </a>
              </Button>
            )}
            <Button asChild size="sm">
              <a
                href={`/estetica-salon/agendar?clienta=${encodeURIComponent(e.clienteId)}&espera=${encodeURIComponent(e.esperaId)}`}
              >
                Agendar<span className="sr-only"> a {e.clienteNombre}</span>
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupada === e.esperaId}
              onClick={() => {
                marcar(e, 'cancelar');
              }}
            >
              Ya no<span className="sr-only">: quitar a {e.clienteNombre} de la espera</span>
            </Button>
          </span>
        );
      },
    },
  ];

  return (
    <section aria-label="Lista de espera" className="flex flex-col gap-(--espacio-2)">
      <h2 className="flex items-baseline justify-between text-sm font-semibold">
        Lista de espera
        <Cifra valor={esperas?.length ?? null} tamano="sm" />
      </h2>
      {fallo !== null ? (
        <Aviso tono="atencion" titulo={fallo} />
      ) : esperas === null ? (
        <EsqueletoDeLista filas={2} />
      ) : (
        <Tabla
          etiqueta="Lista de espera"
          columnas={columnas}
          filas={esperas}
          claveDe={(e) => e.esperaId}
          alto="max-h-[30dvh]"
          vacio={<Vacio titulo="Nadie espera un lugar." className="py-(--espacio-3)" />}
        />
      )}
    </section>
  );
}
