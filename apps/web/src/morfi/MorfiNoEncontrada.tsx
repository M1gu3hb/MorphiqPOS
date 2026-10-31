'use client';

import { useState, type ReactNode } from 'react';

import { Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { MapPinOff } from 'lucide-react';

import { useExperiencia } from '~/proveedores/Experiencia';

import { ClipDeMorfi } from './ClipDeMorfi';
import { CLIPS, cajaEnElEscenario } from './clips';
import { HoyoEnLaTarjeta } from './HoyoEnLaTarjeta';
import { PRIORIDAD } from './turno';

const porciento = (fraccion: number): string => `${(fraccion * 100).toFixed(3)}%`;

function enElEscenario(caja: ReturnType<typeof cajaEnElEscenario>) {
  return {
    left: porciento(caja.izquierda),
    top: porciento(caja.arriba),
    width: porciento(caja.ancho),
    height: porciento(caja.alto),
  };
}

/**
 * LA PÁGINA QUE NO EXISTE, CON MORFI (DP-11.1): se asoma por un hoyo en la tarjeta, mira a los
 * lados, se pregunta qué pasó y señala el botón —en diagonal, sin tapar el título— antes de
 * meterse otra vez. Todo lo que se lee es texto real. Se cierra con un toque.
 *
 * Con «Mascota Morfi» apagada es el vacío del sistema, con el mismo texto y la misma acción.
 */
export function MorfiNoEncontrada({
  titulo,
  explicacion,
  accion,
  nivelDeTitulo = 2,
}: {
  readonly titulo: string;
  readonly explicacion: string;
  readonly accion?: ReactNode;
  readonly nivelDeTitulo?: 2 | 3;
}) {
  const { experiencia } = useExperiencia();
  const [oculto, setOculto] = useState(false);

  if (!experiencia.mascota) {
    return (
      <Vacio
        icono={<MapPinOff />}
        titulo={titulo}
        explicacion={explicacion}
        nivelDeTitulo={nivelDeTitulo}
        accion={accion}
      />
    );
  }

  const { escenario, recorte, hoyo } = CLIPS['no-encontrada'].escena;
  const Titulo = nivelDeTitulo === 3 ? 'h3' : 'h2';
  return (
    <Superficie nivel={2} relleno={6} className="w-full max-w-lg text-center">
      <div
        className="relative w-full"
        style={{ aspectRatio: `${String(escenario.ancho)} / ${String(escenario.alto)}` }}
      >
        <HoyoEnLaTarjeta
          className="absolute"
          style={enElEscenario(cajaEnElEscenario(escenario, hoyo.caja))}
        />
        {oculto ? null : (
          <button
            type="button"
            aria-label="Ocultar a Morfi"
            onClick={() => {
              setOculto(true);
            }}
            className="absolute block cursor-pointer p-0"
            style={enElEscenario(cajaEnElEscenario(escenario, recorte))}
          >
            <ClipDeMorfi
              clave="no-encontrada"
              prioridad={PRIORIDAD.noEncontrada}
              className="block size-full"
            />
          </button>
        )}
      </div>
      <Titulo className="text-xl font-semibold text-texto">{titulo}</Titulo>
      <p className="mt-(--espacio-1) text-sm text-texto-sutil">{explicacion}</p>
      {accion === undefined ? null : (
        <div className="mt-(--espacio-4) flex justify-center">{accion}</div>
      )}
    </Superficie>
  );
}
