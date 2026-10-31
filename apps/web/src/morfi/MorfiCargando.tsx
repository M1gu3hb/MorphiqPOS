'use client';

import { useState } from 'react';

import { PantallaDeCarga } from '@morphiqpos/ui/sistema';

import { useExperiencia } from '~/proveedores/Experiencia';

import { ClipDeMorfi } from './ClipDeMorfi';
import { CLIPS, sobreLaTarjeta } from './clips';
import { PRIORIDAD } from './turno';

const porciento = (fraccion: number): string => `${(fraccion * 100).toFixed(3)}%`;

/**
 * «CARGANDO», CON MORFI (DP-11.1): asomado detrás de la tarjeta, con las manos EXACTO en su
 * orilla, haciendo malabares con los cubitos. La tarjeta, su texto y su barra son la
 * `PantallaDeCarga` del sistema; Morfi sólo se asoma. Nada se ve antes de 600 ms, pero el clip
 * ya se está descargando desde el primer instante.
 *
 * Se cierra con un toque (queda la tarjeta). Con «Mascota Morfi» apagada, la tarjeta sola.
 */
export function MorfiCargando({
  titulo,
  variante = 'pantalla',
}: {
  readonly titulo: string;
  readonly variante?: 'pantalla' | 'contenida';
}) {
  const { experiencia } = useExperiencia();
  const [oculto, setOculto] = useState(false);
  const conMorfi = experiencia.mascota && !oculto;
  const { escena } = CLIPS.cargando;
  const p = sobreLaTarjeta(escena);

  const morfi = conMorfi ? (
    <button
      type="button"
      aria-label="Ocultar a Morfi"
      onClick={() => {
        setOculto(true);
      }}
      className="absolute block cursor-pointer p-0"
      style={{
        left: porciento(p.izquierda),
        width: porciento(p.ancho),
        bottom: '100%',
        aspectRatio: `${String(escena.recorte.ancho)} / ${String(escena.recorte.alto)}`,
        transform: `translateY(${porciento(p.bajaDeLaOrilla)})`,
      }}
    >
      <ClipDeMorfi clave="cargando" prioridad={PRIORIDAD.cargando} className="block size-full" />
    </button>
  ) : undefined;

  return (
    <PantallaDeCarga
      titulo={titulo}
      variante={variante}
      mascota={morfi}
      solapeDeLaMascota={conMorfi ? p.solape : 0}
    />
  );
}
