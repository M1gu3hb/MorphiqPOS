'use client';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { api, ErrorPuente } from '@/api/cliente';

const POSAuthContext = createContext(null);

const CLAVE = 'posUser';

function leerGuardado() {
  try {
    const guardado = sessionStorage.getItem(CLAVE);
    return guardado ? JSON.parse(guardado) : null;
  } catch {
    return null;
  }
}

/**
 * QUIÉN ESTÁ DENTRO, y lo dice el SERVIDOR (bloque D de la 2.4).
 *
 * Esto creía sólo a `sessionStorage`, que es de la PESTAÑA: una pestaña nueva —o el
 * navegador que la restaura— llegaba con la cookie de sesión válida ocho horas y la
 * interfaz mandaba al PIN; y una sesión ya vencida o revocada seguía pintando la barra con
 * el nombre de quien ya no estaba. Ahora, al montar, se pregunta a `/api/catalogo/sesion`:
 *
 *   · si contesta quién es, ése es el usuario (y se guarda para el siguiente montaje);
 *   · si contesta que no hay nadie (401, o 403 si la sesión se revocó), se borra lo
 *     guardado y `AppLayout` lleva al PIN;
 *   · si no se pudo preguntar (red, 5xx), se conserva lo guardado: sacar a la cajera a
 *     media venta por un corte de un segundo es peor que esperar.
 *
 * Lo guardado se pinta mientras llega la respuesta, para que la barra no parpadee. Y la
 * respuesta se descarta si mientras tanto alguien ENTRÓ o SALIÓ: una pregunta que salió
 * antes del PIN no puede sacar a quien acaba de entrar.
 */
export function POSAuthProvider({ children }) {
  const [posUser, setPosUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const version = useRef(0);

  useEffect(() => {
    const guardado = leerGuardado();
    const alPreguntar = version.current;
    if (guardado) {
      setPosUser(guardado);
      setIsLoading(false);
    }
    let vigente = true;
    api.auth
      .me()
      .then((delServidor) => {
        if (!vigente || version.current !== alPreguntar) return;
        setPosUser(delServidor);
        try {
          sessionStorage.setItem(CLAVE, JSON.stringify(delServidor));
        } catch {
          // Sin almacenamiento (modo privado) la sesión sigue en la cookie.
        }
      })
      .catch((fallo) => {
        if (!vigente || version.current !== alPreguntar) return;
        if (fallo instanceof ErrorPuente && fallo.estado === 401) {
          setPosUser(null);
          try {
            sessionStorage.removeItem(CLAVE);
          } catch {
            // Nada que borrar.
          }
        }
      })
      .finally(() => {
        if (vigente) setIsLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, []);

  const login = (user) => {
    version.current += 1;
    setPosUser(user);
    setIsLoading(false);
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(user));
    } catch {
      // La cookie de sesión manda; esto sólo evita el parpadeo del siguiente montaje.
    }
  };

  const logout = () => {
    version.current += 1;
    setPosUser(null);
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {
      // Nada que borrar.
    }
  };

  return (
    <POSAuthContext.Provider value={{ posUser, login, logout, isLoading }}>
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth() {
  const ctx = useContext(POSAuthContext);
  if (!ctx) throw new Error('usePOSAuth must be used within POSAuthProvider');
  return ctx;
}
