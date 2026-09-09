'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { obtenerApi, invocarComando } from '@/cliente/api';

import { etiquetaDeRol, rolMH } from './roles.ts';

/**
 * Portado de `historico/restaurante/src/lib/POSAuthContext.jsx`.
 *
 * La forma que ven las pantallas es la misma —`posUser`, `login`, `logout`,
 * `isLoading`, y el mismo `usePOSAuth()` que lanza fuera del provider—, así que
 * su `AppLayout` y su `Sidebar` no cambian ni una línea por esto.
 *
 * ── Lo único que cambia, y no se negocia ──────────────────────────────────
 * El usuario ya NO sale de `sessionStorage`. Ahí era un objeto que el navegador
 * escribía y el navegador creía: cambiar `rol` a `administrador` desde la
 * consola abría el sistema entero. Ahora sale de la cookie firmada `HttpOnly`
 * que el servidor emite al validar el PIN, y se relee del servidor. El script
 * de la página no puede leerla ni fabricarla.
 *
 * Consecuencia visible, y es la correcta: una baja a media jornada cierra la
 * sesión en la siguiente navegación, no cuando alguien cierre la pestaña.
 */

export interface UsuarioPos {
  readonly nombre: string;
  /**
   * El rol EN SU VOCABULARIO —`administrador`, `caja`, `mesero`, `cocina`—,
   * que es el que entienden su `permissions.js` y su barra lateral. La
   * traducción vive en `roles.ts` y ocurre aquí, una sola vez.
   */
  readonly rol: string;
  /** La etiqueta con el rol REAL de la base: un dueño dice «Dueño». */
  readonly etiqueta: string;
}

interface RespuestaSesion {
  readonly rol: string;
  readonly nombre: string;
  readonly paquete: string;
  readonly nombreNegocio: string;
  readonly nombreSucursal: string | null;
  readonly tieneTerminal: boolean;
}

export interface ValorPOSAuth {
  readonly posUser: UsuarioPos | null;
  readonly login: (user: UsuarioPos) => void;
  readonly logout: () => void;
  readonly isLoading: boolean;
  /** Vuelve a preguntar al servidor. La usa la pantalla de entrada al terminar. */
  readonly refrescar: () => Promise<void>;
}

const POSAuthContext = createContext<ValorPOSAuth | null>(null);

export function POSAuthProvider({ children }: { readonly children: ReactNode }) {
  const [posUser, setPosUser] = useState<UsuarioPos | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const clienteConsultas = useQueryClient();

  const refrescar = useCallback(async () => {
    try {
      const sesion = await obtenerApi<RespuestaSesion>('/api/catalogo/sesion');
      setPosUser({
        nombre: sesion.nombre,
        rol: rolMH(sesion.rol) ?? '',
        etiqueta: etiquetaDeRol(sesion.rol),
      });
    } catch {
      // Sin sesión válida no hay usuario. No se distingue «no ha entrado» de
      // «le dieron de baja» en el cliente: las dos llevan al mismo sitio, y el
      // servidor ya respondió cuál era con su código.
      setPosUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sincroniza con un sistema externo —la sesión del servidor— al montar. Es
  // el caso para el que existen los efectos; el `setState` va dentro de la
  // promesa, no en el cuerpo, pero la regla no sabe distinguirlo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refrescar();
  }, [refrescar]);

  const login = useCallback((user: UsuarioPos) => {
    // Optimista y sólo para pintar: la cookie ya la puso el servidor al
    // responder a `/api/auth/entrar`. Nada de lo que se guarde aquí autoriza.
    setPosUser(user);
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setPosUser(null);
    // Los datos del negocio salen con la sesion. Dejarlos en cache haria que la
    // siguiente persona viera el nombre y el paquete de la anterior mientras
    // carga la suya.
    clienteConsultas.clear();
    // La cookie es `HttpOnly`: borrarla sólo puede hacerlo el servidor. Si la
    // petición falla, el usuario local queda en null igualmente — enseñar la
    // pantalla de entrada con la sesión viva es preferible a lo contrario.
    void invocarComando<null>('/api/auth/salir', {}).catch(() => null);
  }, [clienteConsultas]);

  return (
    <POSAuthContext.Provider value={{ posUser, login, logout, isLoading, refrescar }}>
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth(): ValorPOSAuth {
  const ctx = useContext(POSAuthContext);
  if (!ctx) throw new Error('usePOSAuth must be used within POSAuthProvider');
  return ctx;
}
