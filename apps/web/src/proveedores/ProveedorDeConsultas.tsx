'use client';

import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useConfig } from '@/lib/ConfigContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { crearQueryClient } from '@/lib/query-client';

import {
  CONTEXTO_INICIAL,
  cambioDePlantilla,
  claveDeContexto,
  siguienteContexto,
  sobreviveAlCambioDePlantilla,
  type EstadoDeContexto,
} from '~/cliente/contexto-de-consultas';

/** Lo que se lee de los contextos heredados, que son JavaScript y el compilador no los tipa. */
interface QuienEntro {
  readonly posUser: {
    readonly id?: string;
    readonly organizacionId?: string;
    readonly paquete?: string;
  } | null;
  readonly sesion: number;
}
interface ConfiguracionDelNegocio {
  readonly config: { readonly id?: unknown } | null;
  readonly paquete_modo?: unknown;
  readonly isLoading: boolean;
}

/**
 * UN CACHÉ DE CONSULTAS POR CONTEXTO (negocio · empleo · plantilla).
 *
 * El porqué y las reglas están en `cliente/contexto-de-consultas.ts`. Esta pieza sólo las
 * ejecuta: cuando el contexto cambia, descarta el `QueryClient` y monta uno vacío.
 *
 * ── Por qué la `key` y no sólo un cliente nuevo ───────────────────────────
 * Cada `useQuery` crea su observador UNA vez con el cliente que había y se queda con él.
 * Pasarle un `client` distinto al proveedor no lo cambia: seguiría suscrito al caché
 * viejo. Remontar el árbol (la `key`) es lo que obliga a cada observador a nacer en el
 * cliente nuevo, y a la vez suelta el estado local que era de la sesión anterior —un
 * diálogo abierto, un carrito a medias—, que tampoco debe pasar a quien entra.
 *
 * Va DENTRO de `POSAuthProvider` porque necesita saber quién está dentro; por eso
 * `POSAuthProvider` no puede usar consultas (y no las usa).
 */
export function ProveedorDeConsultas({ children }: { readonly children: ReactNode }) {
  const { posUser, sesion } = usePOSAuth() as unknown as QuienEntro;
  const clave = claveDeContexto(posUser);

  const [vigente, setVigente] = useState<{
    readonly estado: EstadoDeContexto;
    readonly cliente: QueryClient;
  }>(() => ({ estado: CONTEXTO_INICIAL, cliente: crearQueryClient() }));

  // Estado derivado durante el render (el patrón que documenta React para «ajustar estado
  // cuando cambia una prop»): el árbol nunca llega a pintarse con el cliente viejo.
  let actual = vigente;
  const transicion = siguienteContexto(vigente.estado, clave, sesion);
  if (transicion.estado !== vigente.estado) {
    actual = {
      estado: transicion.estado,
      cliente: transicion.reiniciar ? crearQueryClient() : vigente.cliente,
    };
    setVigente(actual);
  }

  // El cliente descartado se vacía DESPUÉS de que su árbol se desmontó: así ya no tiene
  // observadores, y no se limpia dos veces en el doble efecto del modo estricto (ahí el
  // «anterior» es el mismo cliente).
  const anterior = useRef<QueryClient | null>(null);
  useEffect(() => {
    const descartado = anterior.current;
    anterior.current = actual.cliente;
    if (descartado !== null && descartado !== actual.cliente) {
      void descartado.cancelQueries();
      descartado.clear();
    }
  }, [actual.cliente]);

  return (
    <QueryClientProvider key={actual.estado.generacion} client={actual.cliente}>
      {children}
    </QueryClientProvider>
  );
}

/**
 * LA PLANTILLA CAMBIÓ SIN RECARGAR (Configuración → Paquete): lo que hay en el caché es de
 * la plantilla anterior.
 *
 * No se descarta el cliente —la configuración misma tiene que sobrevivir, de ella depende
 * toda la pantalla—: se reinician las demás consultas, que cancela las que iban en vuelo
 * (su respuesta no se escribe) y vuelve a pedir las que están a la vista.
 *
 * Va dentro de `ConfigProvider`, que es quien sabe la plantilla.
 */
export function GuardiaDePlantilla() {
  const {
    config,
    paquete_modo: plantilla,
    isLoading,
  } = useConfig() as unknown as ConfiguracionDelNegocio;
  const cliente = useQueryClient();
  const asentada = useRef<string | null>(null);

  // La plantilla de omisión (`tienda`) que corre mientras la configuración carga no es una
  // plantilla: sólo cuenta la de una configuración que ya llegó (la real trae `id`).
  const delServidor =
    !isLoading && typeof config?.id === 'string' && typeof plantilla === 'string'
      ? plantilla
      : null;

  useEffect(() => {
    const decision = cambioDePlantilla(asentada.current, delServidor);
    asentada.current = decision.asentada;
    if (!decision.reiniciar) return;
    const filtro = {
      predicate: (consulta: { readonly queryKey: readonly unknown[] }) =>
        !sobreviveAlCambioDePlantilla(consulta.queryKey),
    };
    void cliente.cancelQueries(filtro);
    void cliente.resetQueries(filtro);
  }, [delServidor, cliente]);

  return null;
}
