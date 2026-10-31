'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso } from '@morphiqpos/ui/sistema';
import { useState } from 'react';

import { conDisenoPropio, disenoDeLaMesa, sinDisenoPropio, tieneDisenoPropio } from './diseno';
import { EditorDeDisenoDeQr } from './EditorDeDisenoDeQr';
import { MiniaturaDelQr } from './MiniaturaDelQr';
import type { MesaConQr } from './PanelDeLosQr';
import type { EstadoDeLosQr, EstadoDelLogo } from './use-qr-de-mesas';

/**
 * EL QR DE UNA MESA EN SU TARJETA (DP-9.8): cómo se ve con su diseño y, para el dueño,
 * «Personalizar» (un diseño sólo para esta mesa) y «Restablecer al diseño general».
 */
export function DisenoDeLaMesa({
  mesa,
  estado,
  logo,
}: {
  readonly mesa: MesaConQr;
  readonly estado: EstadoDeLosQr;
  readonly logo: EstadoDelLogo;
}) {
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const qr = estado.qr;
  if (qr === null || mesa.contenido === null) {
    return (
      <div className="flex size-[calc(var(--altura-control)*2)] items-center justify-center text-xs text-texto-sutil">
        Sin token
      </div>
    );
  }
  const contenido = mesa.contenido;
  const propio = tieneDisenoPropio(qr, mesa.id);

  const restablecer = async () => {
    setOcupado(true);
    setFallo(null);
    try {
      await estado.guardar(sinDisenoPropio(qr, mesa.id));
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo restablecer el diseño.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div
      role="group"
      aria-label={`Diseño del QR de la mesa ${String(mesa.numero)}`}
      className="flex flex-col items-center gap-(--espacio-1)"
    >
      <MiniaturaDelQr
        contenido={contenido}
        numero={mesa.numero}
        diseno={disenoDeLaMesa(qr, mesa.id)}
        logo={logo.logo}
      />
      {propio ? <Badge variant="secondary">Diseño propio</Badge> : null}
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
      <Button
        size="sm"
        variant="ghost"
        className="text-xs"
        onClick={() => {
          setEditando(true);
        }}
      >
        Personalizar
      </Button>
      {propio ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          disabled={ocupado}
          onClick={() => void restablecer()}
        >
          Restablecer al diseño general
        </Button>
      ) : null}
      {editando ? (
        <EditorDeDisenoDeQr
          abierto
          titulo={`QR de la mesa ${String(mesa.numero)}`}
          descripcion="Un diseño sólo para esta mesa. «Restablecer» la regresa al general."
          inicial={disenoDeLaMesa(qr, mesa.id)}
          muestra={{ contenido, numero: mesa.numero }}
          logo={logo.logo}
          alCerrar={() => {
            setEditando(false);
          }}
          alGuardar={async (diseno) => {
            await estado.guardar(conDisenoPropio(qr, mesa.id, diseno));
            setEditando(false);
          }}
        />
      ) : null}
    </div>
  );
}
