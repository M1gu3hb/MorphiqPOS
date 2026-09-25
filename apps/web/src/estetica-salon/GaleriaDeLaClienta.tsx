'use client';

import { Aviso, Esqueleto, Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { Images } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * LA GALERÍA DE LA CLIENTA: sus fotos de antes y después, con su servicio (F-434; C.10 de
 * la 2.4). Las guarda `expediente.foto` y las lee `expediente.fotos`; antes nada las leía y
 * la ficha decía «las fotos cuelgan del servicio» sin enseñar ninguna.
 *
 * Una foto sin consentimiento se enseña aquí —es su expediente— pero lo dice: no se
 * publica. Fondo y no `<img>`, como la ficha de pieza: la URL viene de la base y entra a
 * CSS con las comillas y barras limpias.
 */

export interface FotoDeLaClienta {
  readonly fotoId: string;
  readonly url: string;
  readonly momento: 'antes' | 'despues';
  readonly tomadaEn: string;
  readonly servicioNombre: string | null;
  readonly conConsentimiento: boolean;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function GaleriaDeLaClienta({
  clienteId,
  lectura = 0,
}: {
  readonly clienteId: string;
  /** Sube cuando se agrega una foto: se vuelve a leer. */
  readonly lectura?: number;
}) {
  const [fotos, setFotos] = useState<readonly FotoDeLaClienta[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    invocarComando<{ readonly fotos: readonly FotoDeLaClienta[] }>(
      '/api/expediente/fotos',
      { clienteId },
      { signal: control.signal },
    )
      .then((salida) => {
        if (!control.signal.aborted) setFotos(salida.fotos);
      })
      .catch((error: unknown) => {
        if (control.signal.aborted) return;
        setFallo(error instanceof ErrorApi ? error.message : 'No se pudieron leer las fotos.');
      });
    return () => {
      control.abort();
    };
  }, [clienteId, lectura]);

  if (fallo !== null) {
    return (
      <Aviso tono="atencion" titulo="No se pudieron leer sus fotos.">
        {fallo}
      </Aviso>
    );
  }
  if (fotos === null) {
    return (
      <div className="grid grid-cols-3 gap-(--espacio-2)">
        <Esqueleto className="aspect-square w-full rounded-md" />
        <Esqueleto className="aspect-square w-full rounded-md" />
        <Esqueleto className="aspect-square w-full rounded-md" />
      </div>
    );
  }
  if (fotos.length === 0) {
    return (
      <Vacio
        icono={<Images />}
        titulo="Todavía no hay fotos."
        explicacion="Las de antes y después de cada servicio aparecen aquí, con su fecha."
      />
    );
  }
  return (
    <ul aria-label="Fotos de la clienta" className="grid grid-cols-3 gap-(--espacio-2)">
      {fotos.map((foto) => {
        const pie = `${foto.momento === 'antes' ? 'Antes' : 'Después'} · ${foto.servicioNombre ?? 'sin servicio'} · ${fecha(foto.tomadaEn)}`;
        return (
          <li key={foto.fotoId} className="flex flex-col gap-(--espacio-1)">
            <a href={foto.url} target="_blank" rel="noopener noreferrer">
              <Superficie
                role="img"
                aria-label={pie}
                nivel={0}
                relleno={0}
                className="aspect-square w-full bg-fondo-sutil bg-cover bg-center"
                style={{ backgroundImage: `url("${foto.url.replace(/["\\]/g, '')}")` }}
              >
                {null}
              </Superficie>
            </a>
            <span className="text-xs text-texto-sutil">{pie}</span>
            {foto.conConsentimiento ? null : (
              <span className="text-xs font-medium">sin consentimiento · no se publica</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
