'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Aviso, EsqueletoDeLista } from '@morphiqpos/ui/sistema';
import { useQuery } from '@tanstack/react-query';
import { Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

interface Estacion {
  readonly id: string;
  readonly nombre: string;
}

interface Conectado {
  readonly estacionNombre: string;
  readonly token: string;
}

/** El QR del teléfono, dibujado aquí mismo: sin servicios externos. */
function useImagenDelQr(direccion: string | null): string | null {
  const [imagen, setImagen] = useState<string | null>(null);
  useEffect(() => {
    if (direccion === null) return;
    let vigente = true;
    QRCode.toDataURL(direccion, { width: 320, margin: 1, errorCorrectionLevel: 'M' }).then(
      (url) => {
        if (vigente) setImagen(url);
      },
      () => {
        if (vigente) setImagen(null);
      },
    );
    return () => {
      vigente = false;
    };
  }, [direccion]);
  return direccion === null ? null : imagen;
}

/**
 * «Conectar teléfono» en la pantalla de Cocina (DP-9.4). Enseña el QR del teléfono de UNA
 * estación para hoy; generarlo otra vez revoca el anterior. Un cocinero con estación fija sólo
 * ve la suya (y el servidor sólo le deja esa); quien ve todas, elige.
 */
export function ConectarTelefono({ estacionFijaId }: { readonly estacionFijaId: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [conectado, setConectado] = useState<Conectado | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const estaciones = useQuery({
    queryKey: ['estaciones-del-telefono'],
    queryFn: () =>
      consultarPuente<Estacion>('EstacionPreparacion', { filtro: { activo: true }, limite: 50 }),
    enabled: abierto,
  });
  const visibles = (estaciones.data ?? []).filter(
    (e) => estacionFijaId === null || e.id === estacionFijaId,
  );
  const direccion =
    conectado === null ? null : `${window.location.origin}/cocina-telefono/${conectado.token}`;
  const imagen = useImagenDelQr(direccion);

  async function conectar(estacion: Estacion): Promise<void> {
    setEnCurso(estacion.id);
    setFallo(null);
    try {
      setConectado(
        await invocarComando<Conectado>('/api/restaurante/conectar-telefono-de-cocina', {
          estacionId: estacion.id,
        }),
      );
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo conectar el teléfono.');
    } finally {
      setEnCurso(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setConectado(null);
          setAbierto(true);
        }}
      >
        <Smartphone aria-hidden />
        Conectar teléfono
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar teléfono</DialogTitle>
            <DialogDescription>
              Un teléfono por estación. El código vale hoy; generar otro apaga el anterior.
            </DialogDescription>
          </DialogHeader>
          {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
          {conectado === null ? (
            estaciones.isPending ? (
              <EsqueletoDeLista filas={2} />
            ) : visibles.length === 0 ? (
              <Aviso tono="atencion" titulo="No hay estaciones activas para conectar." />
            ) : (
              <div className="flex flex-col gap-(--espacio-2)">
                {visibles.map((estacion) => (
                  <Button
                    key={estacion.id}
                    type="button"
                    variant="secondary"
                    cargando={enCurso === estacion.id}
                    disabled={enCurso !== null}
                    onClick={() => {
                      void conectar(estacion);
                    }}
                  >
                    {estacion.nombre}
                  </Button>
                ))}
              </div>
            )
          ) : (
            <figure className="flex flex-col items-center gap-(--espacio-2) text-center">
              {imagen === null ? (
                <EsqueletoDeLista filas={1} />
              ) : (
                // Un <img> y no `next/image`: es un `data:` dibujado aquí, no hay qué optimizar.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagen}
                  width={320}
                  height={320}
                  alt={`Código QR del teléfono de ${conectado.estacionNombre}`}
                />
              )}
              <figcaption>
                <strong>{conectado.estacionNombre}</strong> · vale hasta que termine el día
              </figcaption>
              <a className="text-sm break-all underline" href={direccion ?? undefined}>
                {direccion}
              </a>
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
