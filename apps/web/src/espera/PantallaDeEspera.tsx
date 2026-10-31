'use client';

import { useEffect, useState } from 'react';

import { CLIPS } from '~/morfi/clips';
import { ClipDeMorfi } from '~/morfi/ClipDeMorfi';
import { PRIORIDAD } from '~/morfi/turno';
import { useSinMovimiento } from '~/morfi/use-clip';
import { useExperiencia } from '~/proveedores/Experiencia';

import { CapaModal } from './CapaModal';
import { desplazamientoContraQuemado, horaYFecha } from './reloj';

const MARGEN_CONTRA_QUEMADO = 24;
const MINUTO_MS = 60_000;
/** Si el clip de despertar no avisa que terminó (sin red, no carga), la capa se va igual. */
const RESPALDO_DEL_DESPERTAR_MS = CLIPS.despertar.duracionMs + 500;

/** La hora de ahora, que se vuelve a leer justo al cambiar de minuto. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const siguiente = window.setTimeout(
      () => {
        setAhora(Date.now());
      },
      MINUTO_MS - (ahora % MINUTO_MS),
    );
    return () => {
      window.clearTimeout(siguiente);
    };
  }, [ahora]);
  return ahora;
}

/**
 * LA PANTALLA DEL MODO ESPERA (DP-11.2): casi negra, la hora grande y la fecha, el logo del
 * negocio y Morfi dormido en bucle. Todo se desplaza muy despacio contra el quemado.
 *
 * Es una CAPA (`CapaModal`, en la capa superior del navegador) encima de la pantalla, que sigue
 * montada debajo: al volver, lo tecleado sigue ahí. Despierta con el clic completo y no con el
 * dedo que baja: así el toque se queda en la capa y no cae en el botón de abajo. Al tocar, Morfi
 * despierta (se asoma, sonríe y saluda) y la capa se va; otro toque se lo salta. Sin mascota o
 * con «reducir movimiento», se va al primer toque.
 */
export function PantallaDeEspera({
  logo,
  nombre,
  zona,
  dormidaDesde,
  alDespertar,
}: {
  readonly logo: string;
  readonly nombre: string;
  readonly zona: string;
  readonly dormidaDesde: number;
  readonly alDespertar: () => void;
}) {
  const { experiencia } = useExperiencia();
  const sinMovimiento = useSinMovimiento();
  const [despertando, setDespertando] = useState(false);
  const ahora = useAhora();
  const { hora, meridiano, fecha } = horaYFecha(new Date(ahora), zona);
  const { x, y } = desplazamientoContraQuemado(ahora - dormidaDesde, MARGEN_CONTRA_QUEMADO);
  const conMorfi = experiencia.mascota;

  useEffect(() => {
    if (!despertando) return undefined;
    const respaldo = window.setTimeout(alDespertar, RESPALDO_DEL_DESPERTAR_MS);
    return () => {
      window.clearTimeout(respaldo);
    };
  }, [despertando, alDespertar]);

  const tocar = (): void => {
    if (despertando || !conMorfi || sinMovimiento) {
      alDespertar();
      return;
    }
    setDespertando(true);
  };

  return (
    <CapaModal
      etiqueta="Modo espera. Toca la pantalla para volver."
      data-modo-espera={despertando ? 'despertando' : 'dormido'}
      alTocar={tocar}
      alTeclear={(evento) => {
        // La tecla que despierta se queda aquí: al irse la capa el foco vuelve a lo de abajo, y
        // un Enter o una letra no deben caerle.
        evento.preventDefault();
        tocar();
      }}
      className="cursor-pointer select-none"
    >
      <div className="flex size-full flex-col items-center justify-center">
        <div
          className="flex flex-col items-center gap-(--espacio-3) transition-transform duration-(--duracion-lenta) ease-linear"
          style={{ transform: `translate(${String(x)}px, ${String(y)}px)` }}
        >
          <p className="text-sm opacity-60">Toca la pantalla para volver</p>
          {logo === '' ? null : (
            // eslint-disable-next-line @next/next/no-img-element -- el logo viene del almacén del negocio, fuera de `next/image`
            <img
              src={logo}
              alt={nombre}
              className="h-(--espacio-16) w-auto opacity-80"
              draggable={false}
            />
          )}
          <p className="flex items-baseline gap-(--espacio-2) font-semibold tabular-nums">
            <span className="text-display leading-none">{hora}</span>
            <span className="text-2xl">{meridiano}</span>
          </p>
          <p className="text-lg first-letter:uppercase opacity-80">{fecha}</p>
        </div>
      </div>
      {conMorfi ? (
        <div className="absolute bottom-0 left-1/2 aspect-[524/532] h-[38vh] -translate-x-1/2">
          {despertando ? (
            <ClipDeMorfi
              clave="despertar"
              prioridad={PRIORIDAD.espera}
              className="block size-full"
              alTerminar={alDespertar}
            />
          ) : (
            <ClipDeMorfi clave="dormido" prioridad={PRIORIDAD.espera} className="block size-full" />
          )}
        </div>
      ) : null}
    </CapaModal>
  );
}
