'use client';

import type { ImagenLogo } from '@morphiqpos/domain/qr';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Aviso } from '@morphiqpos/ui/sistema';
import { useState } from 'react';

import { ControlesDelDiseno } from './ControlesDelDiseno';
import { faltaDelDiseno, type DisenoDeQr } from './diseno';
import { MiniaturaDelQr } from './MiniaturaDelQr';
import { useLectura, type EstadoDeLectura } from './use-lectura';

/**
 * EL EDITOR DEL DISEÑO DE UN QR (DP-9.8): el general o el de una mesa. A la izquierda los
 * controles; a la derecha cómo queda, con una mesa de muestra, y si se lee. Un diseño que no se
 * lee no se puede guardar.
 */

function Lectura({ estado }: { readonly estado: EstadoDeLectura }) {
  if (estado.fase === 'revisando') return <Aviso tono="info" titulo="Revisando si se lee…" />;
  if (estado.fase === 'fallo') return <Aviso tono="peligro" titulo={estado.mensaje} />;
  const { legible, fallidas } = estado.resultado;
  return legible ? (
    <Aviso tono="exito" titulo="Se lee: tal cual, pequeño, girado y como foto." />
  ) : (
    <Aviso tono="peligro" titulo="Así no se lee: no se puede guardar ni imprimir.">
      Falló {fallidas.join(', ')}. Sube el contraste, quita el degradado o usa módulos más simples.
    </Aviso>
  );
}

export function EditorDeDisenoDeQr({
  abierto,
  titulo,
  descripcion,
  inicial,
  muestra,
  logo,
  alGuardar,
  alCerrar,
}: {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly descripcion: string;
  readonly inicial: DisenoDeQr;
  /** La mesa con la que se ve y se revisa el diseño: su contenido de verdad y su número. */
  readonly muestra: { readonly contenido: string; readonly numero: number };
  readonly logo: ImagenLogo | null;
  readonly alGuardar: (diseno: DisenoDeQr) => Promise<void>;
  readonly alCerrar: () => void;
}) {
  const [diseno, setDiseno] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const falta = faltaDelDiseno(diseno);
  const pieza = falta === null ? { ...muestra, diseno, logo } : null;
  const lectura = useLectura(pieza);
  const sePuedeGuardar =
    falta === null && lectura.fase === 'lista' && lectura.resultado.legible && !guardando;

  const guardar = async () => {
    setGuardando(true);
    setFallo(null);
    try {
      await alGuardar(diseno);
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar el diseño.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(o) => {
        if (!o) alCerrar();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <ControlesDelDiseno diseno={diseno} hayLogo={logo !== null} alCambiar={setDiseno} />
          <div className="flex flex-col items-center gap-(--espacio-3)">
            {pieza === null ? null : <MiniaturaDelQr {...pieza} tamano="grande" />}
            {falta === null ? (
              <Lectura estado={lectura} />
            ) : (
              <Aviso tono="peligro" titulo={falta} />
            )}
            <p className="text-xs text-texto-sutil">
              Muestra: mesa {String(muestra.numero)}. Lo que guarda el QR no cambia: los QR ya
              impresos siguen sirviendo.
            </p>
          </div>
        </div>
        {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
        <DialogFooter>
          <Button variant="outline" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={!sePuedeGuardar}>
            {guardando ? 'Guardando…' : 'Guardar diseño'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
