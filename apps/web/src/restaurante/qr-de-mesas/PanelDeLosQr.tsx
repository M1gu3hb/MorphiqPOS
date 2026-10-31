'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, EsqueletoDeLista, Superficie } from '@morphiqpos/ui/sistema';
import { FileDown, Palette } from 'lucide-react';
import { useState } from 'react';

import { disenoDeLaMesa } from './diseno';
import { EditorDeDisenoDeQr } from './EditorDeDisenoDeQr';
import { descargarPdfDeLasMesas } from './imprimir';
import { MiniaturaDelQr } from './MiniaturaDelQr';
import type { EstadoDeLosQr, EstadoDelLogo } from './use-qr-de-mesas';

export interface MesaConQr {
  readonly id: string;
  readonly numero: number;
  /** La dirección con su token; `null` si la mesa todavía no tiene token. */
  readonly contenido: string | null;
}

/**
 * «DISEÑO DE LOS QR» (DP-9.8), arriba de las mesas en Portal QR → Mesas QR: el diseño general,
 * cómo se ve, y el PDF de todas las mesas para imprimir —revisadas una por una antes—.
 */
export function PanelDeLosQr({
  estado,
  logo,
  mesas,
}: {
  readonly estado: EstadoDeLosQr;
  readonly logo: EstadoDelLogo;
  readonly mesas: readonly MesaConQr[];
}) {
  const [editando, setEditando] = useState(false);
  const [avance, setAvance] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const conToken = mesas.filter(
    (m): m is MesaConQr & { contenido: string } => m.contenido !== null,
  );
  const muestra = conToken[0];

  if (estado.cargando || logo.cargando) return <EsqueletoDeLista filas={1} />;
  if (estado.fallo || estado.qr === null) {
    return (
      <Aviso
        tono="peligro"
        titulo="No se pudo leer el diseño de los QR."
        accion={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              estado.reintentar();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  }
  const qr = estado.qr;

  const imprimirTodas = async () => {
    setFallo(null);
    try {
      await descargarPdfDeLasMesas(
        conToken.map((m) => ({ ...m, diseno: disenoDeLaMesa(qr, m.id) })),
        logo.logo,
        (hechas, total) => {
          setAvance(
            hechas < total
              ? `Revisando la mesa ${String(hechas + 1)} de ${String(total)}…`
              : 'Armando el PDF…',
          );
        },
      );
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo armar el PDF.');
    } finally {
      setAvance(null);
    }
  };

  return (
    <Superficie
      como="section"
      aria-labelledby="titulo-diseno-qr"
      className="flex flex-col gap-(--espacio-3) sm:flex-row sm:items-center"
    >
      {muestra === undefined ? null : (
        <MiniaturaDelQr
          contenido={muestra.contenido}
          numero={muestra.numero}
          diseno={qr.general}
          logo={logo.logo}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-(--espacio-1)">
        <h3 id="titulo-diseno-qr" className="font-heading text-base font-bold">
          Diseño de los QR
        </h3>
        <p className="text-xs text-texto-sutil">
          Un diseño para todas las mesas; cualquier mesa puede tener el suyo. Cambiar el diseño no
          cambia lo que dice el QR: los ya impresos siguen sirviendo.
        </p>
        {logo.fallo ? (
          <Aviso tono="atencion" titulo="No se pudo traer el logo: los QR salen sin logo." />
        ) : null}
        {conToken.length === 0 ? (
          <Aviso
            tono="info"
            titulo="Genera los tokens de las mesas para ver, revisar e imprimir sus QR."
          />
        ) : null}
        {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
        {avance === null ? null : (
          <p className="text-sm text-texto-sutil" role="status">
            {avance}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-(--espacio-2)">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            setEditando(true);
          }}
          disabled={muestra === undefined}
        >
          <Palette className="size-4" aria-hidden /> Diseñar los QR
        </Button>
        <Button
          className="gap-2"
          onClick={() => void imprimirTodas()}
          disabled={conToken.length === 0 || avance !== null}
        >
          <FileDown className="size-4" aria-hidden /> PDF de todas ({String(conToken.length)})
        </Button>
      </div>
      {muestra === undefined || !editando ? null : (
        <EditorDeDisenoDeQr
          abierto
          titulo="Diseño general de los QR"
          descripcion="Se aplica a todas las mesas que no tienen el suyo."
          inicial={qr.general}
          muestra={muestra}
          logo={logo.logo}
          alCerrar={() => {
            setEditando(false);
          }}
          alGuardar={async (general) => {
            await estado.guardar({ general, porMesa: qr.porMesa });
            setEditando(false);
          }}
        />
      )}
    </Superficie>
  );
}
