'use client';

import { useId, useState, useSyncExternalStore } from 'react';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { ToggleGroup, ToggleGroupItem } from '@morphiqpos/ui/primitivas/toggle-group';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { Volume2 } from 'lucide-react';

import { avisarCambioDelAparato, useTextoDelAparato } from '~/cliente/texto-del-aparato';
import { almacenDelAparato } from '~/restaurante/vista-de-solicitudes';
import { falloDelSonido, oir, suscribirAlFallo } from '~/sonidos/gestor';
import {
  CLAVE_DEL_SONIDO,
  PERFILES,
  SONIDO_DE_OMISION,
  gananciaDe,
  guardarPreferenciaDeSonido,
  leerPreferenciaDeSonido,
  type PerfilDeSonido,
  type PreferenciaDeSonido,
} from '~/sonidos/perfil-del-aparato';

const NOMBRE_DEL_PERFIL: Readonly<Record<PerfilDeSonido, string>> = {
  apagado: 'Apagado',
  suave: 'Suave',
  normal: 'Normal',
};

/**
 * EL SONIDO DE ESTE APARATO (DP-11.3), en Configuración → Este aparato: Apagado, Suave o Normal,
 * y el volumen. Se guarda al tocar. La voz de Cocina y de Solicitudes no cambia con esto.
 */
export function SonidoDelAparato() {
  const texto = useTextoDelAparato(CLAVE_DEL_SONIDO);
  const preferencia = leerPreferenciaDeSonido({ getItem: () => texto });
  const fallo = useSyncExternalStore(suscribirAlFallo, falloDelSonido, () => null);
  const [noGuardo, setNoGuardo] = useState(false);
  const titulo = useId();
  const volumen = useId();
  const perfil = useId();

  const guardar = (parte: Partial<PreferenciaDeSonido>): void => {
    setNoGuardo(!guardarPreferenciaDeSonido(almacenDelAparato(), { ...preferencia, ...parte }));
    avisarCambioDelAparato();
  };

  const probar = (): void => {
    const ganancia = gananciaDe(preferencia);
    oir('felt', ganancia > 0 ? ganancia : gananciaDe(SONIDO_DE_OMISION));
  };

  return (
    <Superficie
      como="section"
      relleno={0}
      aria-labelledby={titulo}
      className="flex flex-col gap-(--espacio-5) p-(--espacio-4) sm:p-(--espacio-6)"
    >
      <div className="flex flex-col gap-(--espacio-1)">
        <h3 id={titulo} className="flex items-center gap-(--espacio-2) text-lg font-semibold">
          <Volume2 aria-hidden className="size-5 shrink-0 text-primario" />
          Sonidos de este aparato
        </h3>
        <p className="max-w-prose text-sm text-texto-sutil">
          Cada toque suena corto y suave. «Suave» es lo de siempre; en la cocina o en la barra puede
          ir en Normal o Apagado. La voz de Cocina y de Solicitudes tiene su propio ajuste.
        </p>
      </div>
      <div className="flex flex-col gap-(--espacio-2)">
        <span id={perfil} className="text-sm font-medium">
          Perfil
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby={perfil}
          value={preferencia.perfil}
          onValueChange={(valor) => {
            const elegido = PERFILES.find((p) => p === valor);
            if (elegido !== undefined) guardar({ perfil: elegido });
          }}
        >
          {PERFILES.map((opcion) => (
            <ToggleGroupItem key={opcion} value={opcion} className="px-(--espacio-4)">
              {NOMBRE_DEL_PERFIL[opcion]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-(--espacio-2) sm:max-w-md">
        <label htmlFor={volumen} className="flex justify-between text-sm font-medium">
          <span>Volumen</span>
          <span className="tabular-nums text-texto-sutil">{preferencia.volumen}</span>
        </label>
        <input
          id={volumen}
          type="range"
          min={0}
          max={100}
          step={5}
          value={preferencia.volumen}
          disabled={preferencia.perfil === 'apagado'}
          onChange={(evento) => {
            guardar({ volumen: Number(evento.target.value) });
          }}
          className="accent-primario disabled:opacity-60"
        />
      </div>
      <Button variant="outline" className="self-start" data-sonido="ninguno" onClick={probar}>
        Probar
      </Button>
      {noGuardo ? (
        <Aviso tono="peligro" titulo="Este navegador no deja guardar ajustes" anuncio="alerta">
          Pasa en una ventana privada o con los datos del sitio bloqueados. Se queda como estaba.
        </Aviso>
      ) : null}
      {fallo === null ? null : (
        <Aviso tono="atencion" titulo="Este navegador no dejó sonar">
          Toca la pantalla una vez y vuelve a probar. Si sigue sin sonar, revisa que el aparato no
          esté en silencio.
        </Aviso>
      )}
    </Superficie>
  );
}
