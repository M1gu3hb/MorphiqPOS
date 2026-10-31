'use client';

import { useId, useState } from 'react';

import { Switch } from '@morphiqpos/ui/primitivas/switch';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { MoonStar } from 'lucide-react';

import { avisarCambioDelAparato, useTextoDelAparato } from '~/cliente/texto-del-aparato';
import {
  CLAVE_DE_LA_ESPERA,
  guardarPreferenciaDeEspera,
  leerPreferenciaDeEspera,
  type PreferenciaDeEspera,
} from '~/espera/preferencia-del-aparato';
import { MINUTOS_POR_OMISION } from '~/espera/reglas';
import { almacenDelAparato } from '~/restaurante/vista-de-solicitudes';

/** Los minutos que se ofrecen; «de cada pantalla» es la opción vacía. */
const MINUTOS_A_ELEGIR = [1, 2, 3, 5, 10, 15, 30, 60] as const;

function usePreferenciaDeEspera(): PreferenciaDeEspera {
  const texto = useTextoDelAparato(CLAVE_DE_LA_ESPERA);
  return leerPreferenciaDeEspera({ getItem: () => texto });
}

/**
 * EL MODO ESPERA DE ESTE APARATO (DP-11.2), en Configuración → Este aparato: encenderlo o
 * apagarlo y cuántos minutos sin tocar. Vive en el aparato y no en el negocio: la tableta de la
 * caja puede dormirse y la de la barra no. Se guarda al tocar, sin botón.
 */
export function ModoEsperaDelAparato() {
  const preferencia = usePreferenciaDeEspera();
  const [fallo, setFallo] = useState(false);
  const titulo = useId();
  const minutos = useId();

  const guardar = (parte: Partial<PreferenciaDeEspera>): void => {
    const guardada = guardarPreferenciaDeEspera(almacenDelAparato(), {
      ...preferencia,
      ...parte,
    });
    setFallo(!guardada);
    avisarCambioDelAparato();
  };

  return (
    <Superficie
      como="section"
      relleno={0}
      aria-label="Modo espera de este aparato"
      className="flex flex-col gap-(--espacio-5) p-(--espacio-4) sm:p-(--espacio-6)"
    >
      <div className="flex items-start justify-between gap-(--espacio-4)">
        <div className="flex flex-col gap-(--espacio-1)">
          <h3 id={titulo} className="flex items-center gap-(--espacio-2) text-lg font-semibold">
            <MoonStar aria-hidden className="size-5 shrink-0 text-primario" />
            Modo espera en este aparato
          </h3>
          <p className="max-w-prose text-sm text-texto-sutil">
            Sin tocar la pantalla un rato, se pone casi negra con la hora y Morfi dormido. Al
            tocarla vuelve tal cual estaba. Una comanda nueva o una cuenta pedida la despiertan
            sola. El mesero nunca se duerme.
          </p>
        </div>
        <Switch
          checked={preferencia.activa}
          aria-labelledby={titulo}
          onCheckedChange={(activa) => {
            guardar({ activa });
          }}
        />
      </div>
      <label htmlFor={minutos} className="flex max-w-xs flex-col gap-(--espacio-1) text-sm">
        <span className="font-medium">Minutos sin tocar</span>
        <select
          id={minutos}
          value={preferencia.minutos === null ? '' : String(preferencia.minutos)}
          disabled={!preferencia.activa}
          onChange={(evento) => {
            const valor = evento.target.value;
            guardar({ minutos: valor === '' ? null : Number(valor) });
          }}
          className="h-(--altura-control) w-full rounded-md border border-borde-fuerte bg-superficie px-(--espacio-2) text-sm text-texto outline-none focus-visible:ring-[3px] focus-visible:ring-anillo/60 disabled:opacity-60"
        >
          <option value="">
            Los de cada pantalla ({MINUTOS_POR_OMISION.caja} en Caja y Tablero,{' '}
            {MINUTOS_POR_OMISION.cocina} en Cocina)
          </option>
          {MINUTOS_A_ELEGIR.map((valor) => (
            <option key={valor} value={valor}>
              {valor === 1 ? '1 minuto' : `${String(valor)} minutos`}
            </option>
          ))}
        </select>
      </label>
      {fallo ? (
        <Aviso tono="peligro" titulo="Este navegador no deja guardar ajustes" anuncio="alerta">
          Pasa en una ventana privada o con los datos del sitio bloqueados. Se queda como estaba.
        </Aviso>
      ) : null}
    </Superficie>
  );
}
