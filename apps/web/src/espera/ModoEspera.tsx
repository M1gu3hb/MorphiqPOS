'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useConfig } from '@/lib/ConfigContext';
import { usePOSAuth } from '@/lib/POSAuthContext';

import { useExperiencia } from '~/proveedores/Experiencia';

import { PantallaDeEspera } from './PantallaDeEspera';
import { PedirPinAlDespertar } from './PedirPinAlDespertar';
import { puestoDeEspera } from './reglas';
import { useDespertadorDeCaja } from './use-despertador-de-caja';
import { useModoEspera } from './use-modo-espera';

/**
 * La hora del negocio. Don Poncho está en la Ciudad de México y su servidor corre con
 * `TZ=America/Mexico_City` en las tres fases (`docs/infra/FASES.md`); la tableta puede tener
 * otra, y la hora de la pared tiene que ser la del local.
 */
const ZONA_DEL_NEGOCIO = 'America/Mexico_City';

/** Mientras duerme, cada cuánto vuelve a leer la configuración del negocio. */
const RELEER_DORMIDA_MS = 60_000;

/** Lo que el modo espera lee de la configuración del negocio (contexto heredado, sin tipos). */
interface ConfiguracionDelNegocio {
  readonly config: {
    readonly logo_url?: string | null;
    readonly nombre_negocio?: string | null;
    readonly experiencia?: { readonly pin_al_despertar?: unknown } | null;
  };
}

/** Lo que lee de la sesión (contexto heredado, sin tipos). */
interface SesionDelPuesto {
  readonly posUser: { readonly id: string; readonly nombre: string } | null;
  readonly logout: () => Promise<void>;
}

/**
 * EL MODO ESPERA (DP-11.2), montado por `AppLayout` como hijo con sus propios ganchos: cuando ya
 * hay sesión. Fuera de Caja, Tablero, Cocina y administración no se duerme, pero el candado del
 * PIN vale en todas. Es una capa: la pantalla de abajo sigue montada y nada de lo tecleado se
 * pierde.
 *
 * «Pedir PIN al despertar» se lee de la configuración del negocio (`useConfig`), y si aún no llega,
 * de la que vino al pintar. Al dormirse, y cada minuto mientras duerme, la configuración se vuelve
 * a pedir: un «Pedir PIN» encendido en otro aparato vale al despertar, sin recargar la tableta.
 */
export function ModoEspera({ ruta }: { readonly ruta: string }) {
  const { experiencia } = useExperiencia();
  const { config } = useConfig() as unknown as ConfiguracionDelNegocio;
  const { posUser, logout } = usePOSAuth() as unknown as SesionDelPuesto;
  const consultas = useQueryClient();
  const leido = config.experiencia?.pin_al_despertar;
  const pedirPin = typeof leido === 'boolean' ? leido : experiencia.pin_al_despertar;
  const puesto = puestoDeEspera(ruta);
  const { fase, dormidaDesde, pedirDespertar, volver } = useModoEspera(
    puesto,
    { pedirPin, empleoId: posUser?.id ?? null },
    () => {
      void consultas.invalidateQueries({ queryKey: ['config'] });
    },
  );
  useDespertadorDeCaja(puesto === 'caja');

  useEffect(() => {
    if (fase !== 'dormida') return undefined;
    const releer = window.setInterval(() => {
      void consultas.invalidateQueries({ queryKey: ['config'] });
    }, RELEER_DORMIDA_MS);
    return () => {
      window.clearInterval(releer);
    };
  }, [fase, consultas]);

  if (fase === 'pin') {
    if (posUser === null) return null;
    return (
      <PedirPinAlDespertar
        empleoId={posUser.id}
        nombre={posUser.nombre}
        alVolver={volver}
        // Cerrar la sesión quita el candado, pero sólo si el servidor la cerró (`POSAuthContext`).
        alCambiarDePersona={logout}
      />
    );
  }
  if (fase === 'dormida' && dormidaDesde !== null) {
    return (
      <PantallaDeEspera
        logo={config.logo_url ?? ''}
        nombre={config.nombre_negocio ?? ''}
        zona={ZONA_DEL_NEGOCIO}
        dormidaDesde={dormidaDesde}
        alDespertar={pedirDespertar}
      />
    );
  }
  return null;
}
