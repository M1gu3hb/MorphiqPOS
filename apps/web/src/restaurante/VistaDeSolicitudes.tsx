'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, EsqueletoDeLista, Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { BellRing } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { atenderLaSolicitud, motivoDelFallo } from './atender-solicitud';
import {
  esTipoDeSolicitud,
  TIPOS_DE_SOLICITUD,
  type SolicitudPendiente,
} from './globos-de-solicitud';
import { IconoDeSolicitud } from './IconoDeSolicitud';
import { haceCuanto, nuevasParaAnunciar, solicitudesEnOrden } from './vista-de-solicitudes';

/** Cada cuánto se mueve el «hace cuánto»: al minuto basta. */
const RELOJ_MS = 30_000;

/** La hora, para el «hace cuánto»: avanza sola mientras la vista está abierta. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => {
      setAhora(Date.now());
    }, RELOJ_MS);
    return () => {
      clearInterval(reloj);
    };
  }, []);
  return ahora;
}

/**
 * La voz, SÓLO aquí (DP-9.3): cada solicitud que llega con la vista abierta se anuncia una vez.
 * Las que ya estaban al abrirla no se anuncian: el aparato que entra no suelta una lista en voz.
 */
function useAnunciarLasNuevas(
  solicitudes: readonly SolicitudPendiente[],
  cargando: boolean,
  alAnunciar: (nuevas: readonly SolicitudPendiente[]) => void,
): void {
  const anunciadas = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (cargando) return;
    const yaVistas = anunciadas.current;
    if (yaVistas === null) {
      anunciadas.current = new Set(solicitudes.map((s) => s.id));
      return;
    }
    const nuevas = nuevasParaAnunciar(solicitudes, yaVistas);
    if (nuevas.length === 0) return;
    anunciadas.current = new Set([...yaVistas, ...nuevas.map((s) => s.id)]);
    alAnunciar(nuevas);
  }, [solicitudes, cargando, alAnunciar]);
}

/**
 * LA VISTA «SOLICITUDES» (DP-9.3): toda la pantalla de Mesas es la lista de pendientes, de la
 * que más lleva esperando a la más nueva. Se lee de lejos: la mesa en grande, el tipo con su
 * icono y su texto, y hace cuánto. «Atender» la atiende como el globo de la mesa.
 */
export function VistaDeSolicitudes({
  solicitudes,
  cargando,
  alAtender,
  alAnunciar,
}: {
  readonly solicitudes: readonly SolicitudPendiente[];
  readonly cargando: boolean;
  readonly alAtender: () => void;
  readonly alAnunciar: (nuevas: readonly SolicitudPendiente[]) => void;
}) {
  const ahora = useAhora();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  useAnunciarLasNuevas(solicitudes, cargando, alAnunciar);

  if (cargando) return <EsqueletoDeLista filas={3} />;
  const lista = solicitudesEnOrden(solicitudes);
  if (lista.length === 0) {
    return (
      <Vacio
        icono={<BellRing aria-hidden className="size-[calc(var(--altura-control)*0.9)]" />}
        titulo="Sin solicitudes pendientes"
        explicacion="Cuando una mesa pida ayuda, la cuenta o que le tomen la orden, aparece aquí y se anuncia en voz."
        nivelDeTitulo={2}
      />
    );
  }

  async function atender(id: string): Promise<void> {
    if (enCurso !== null) return;
    setEnCurso(id);
    setFallo(null);
    try {
      await atenderLaSolicitud(id);
      alAtender();
    } catch (error: unknown) {
      setFallo(motivoDelFallo(error));
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <section aria-label="Solicitudes pendientes" className="flex flex-col gap-(--espacio-2)">
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
      <ul className="flex flex-col gap-(--espacio-2)">
        {lista.map((solicitud) => {
          if (!esTipoDeSolicitud(solicitud.tipo)) return null;
          const tipo = TIPOS_DE_SOLICITUD[solicitud.tipo];
          const mesa = `Mesa ${String(solicitud.mesa_numero ?? '—')}`;
          return (
            <Superficie
              como="li"
              key={solicitud.id}
              aria-label={`${mesa}: ${tipo.completo}`}
              relleno={3}
              className="flex items-center gap-(--espacio-3)"
            >
              <IconoDeSolicitud tipo={solicitud.tipo} tamano="lista" />
              <div className="min-w-0 flex-1">
                <p className="text-2xl leading-tight font-bold">{mesa}</p>
                <p className="text-base">
                  {tipo.completo}
                  <span className="text-texto-sutil">
                    {' · '}
                    {haceCuanto(solicitud.created_date, ahora)}
                  </span>
                </p>
              </div>
              <Button
                type="button"
                size="lg"
                cargando={enCurso === solicitud.id}
                disabled={enCurso !== null}
                aria-label={`Atender ${mesa}: ${tipo.completo}`}
                onClick={() => {
                  void atender(solicitud.id);
                }}
              >
                Atender
              </Button>
            </Superficie>
          );
        })}
      </ul>
    </section>
  );
}
