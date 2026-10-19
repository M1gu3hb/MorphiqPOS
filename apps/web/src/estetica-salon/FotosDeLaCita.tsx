'use client';

import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { Camera, Check } from 'lucide-react';
import { useState } from 'react';

import { ErrorApi, invocarComando, subirImagen } from '~/cliente/api';

/**
 * LAS DOS FOTOS DE LA CITA, antes y después, que ahora SÍ se guardan (F-434; C.10 de la
 * 2.4).
 *
 * ── Lo que pasaba ─────────────────────────────────────────────────────────
 * El botón abría la cámara y marcaba «tomada» sin subir nada: la foto se quedaba en el
 * teléfono y el expediente no se enteraba. Y el momento se mandaba —si se hubiera
 * mandado— como «después», con acento, que `expediente.foto` rechaza: el comando pide
 * `despues`. Ahora la foto se sube (`/api/archivos/subir`) y se ata al servicio con su
 * momento (`expediente.foto`, que busca el consentimiento vigente).
 *
 * ── Quién la sube ─────────────────────────────────────────────────────────
 * La subida de archivos es de quien administra el salón: está cerrada al rol de la
 * estilista a propósito, y una mutación de la puerta de backend lo vigila. Si quien la
 * toma no puede subirla, se dice con palabras y la foto no se da por guardada.
 */

const MOMENTOS = [
  { clave: 'antes', etiqueta: 'Antes' },
  { clave: 'despues', etiqueta: 'Después' },
] as const;

type Momento = (typeof MOMENTOS)[number]['clave'];

export function FotosDeLaCita({
  citaServicioId,
  alGuardar,
}: {
  /** El servicio al que se ata la foto; nulo si la cita no tiene uno abierto. */
  readonly citaServicioId: string | null;
  /** Para releer la galería. */
  readonly alGuardar: () => void;
}) {
  const [guardadas, setGuardadas] = useState<readonly Momento[]>([]);
  const [subiendo, setSubiendo] = useState<Momento | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  async function guardar(momento: Momento, archivo: File): Promise<void> {
    if (citaServicioId === null) return;
    setSubiendo(momento);
    setFallo(null);
    try {
      const url = await subirImagen(archivo);
      await invocarComando(`/api/cita-servicios/${citaServicioId}/foto`, { momento, url });
      setGuardadas((previas) => [...previas.filter((m) => m !== momento), momento]);
      alGuardar();
    } catch (error) {
      setFallo(
        error instanceof ErrorApi && error.estado === 403
          ? 'La foto la sube quien administra el salón: tu rol no sube archivos. No se guardó.'
          : error instanceof Error
            ? `${error.message} No se guardó.`
            : 'No se pudo guardar la foto.',
      );
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <div className="flex flex-col gap-(--espacio-2)">
      {citaServicioId === null ? (
        <p className="text-sm text-texto-sutil">
          Sin un servicio abierto no hay a qué atar la foto.
        </p>
      ) : null}
      {/* Un toque y se abre la cámara: `capture` evita el paso por la galería, que es
          donde se pierde el antes. */}
      <div className="grid grid-cols-2 gap-(--espacio-3)">
        {MOMENTOS.map(({ clave, etiqueta }) => {
          const tomada = guardadas.includes(clave);
          return (
            <Superficie
              key={clave}
              como="label"
              interactiva
              activa={tomada}
              nivel={0}
              relleno={3}
              radio="md"
              className={`flex min-h-24 flex-col items-center justify-center gap-(--espacio-1) text-center has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-anillo/60 ${tomada ? '' : 'border-dashed'}`}
            >
              {tomada ? (
                <Check aria-hidden="true" className="size-5 text-exito" />
              ) : (
                <Camera aria-hidden="true" className="size-5 text-texto-sutil" />
              )}
              <span className="text-sm font-medium">
                {subiendo === clave
                  ? `${etiqueta} · subiendo…`
                  : tomada
                    ? `${etiqueta} · guardada`
                    : etiqueta}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={citaServicioId === null || subiendo !== null}
                aria-label={`Tomar la foto de ${etiqueta.toLowerCase()}`}
                onChange={(evento) => {
                  const archivo = evento.target.files?.[0];
                  if (archivo !== undefined) void guardar(clave, archivo);
                }}
              />
            </Superficie>
          );
        })}
      </div>
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
    </div>
  );
}
