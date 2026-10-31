'use client';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { api, ErrorPuente } from '@/api/cliente';
import { claveDeContexto } from '~/cliente/contexto-de-consultas';
import { mismaCocina } from '~/restaurante/alcance-de-la-cocina';
import { almacenDelAparato } from '~/restaurante/vista-de-solicitudes';
import { abrir as abrirElCandado } from '~/espera/candado-del-pin';
import { sonarAntesDeIrse } from '~/sonidos/gestor';

/** @typedef {{id: string, nombre: string, rol: string, etiqueta?: string, esDuenoGeneral?: boolean, enPresentacion?: boolean, paquete?: string, organizacionId?: string, estacion_preparacion_id?: string | null, estacion_preparacion_nombre?: string | null, estacion_preparacion_color?: string | null, puede_ver_todas_estaciones?: boolean}} UsuarioDePOS */
/** @type {React.Context<{posUser: UsuarioDePOS | null, isLoading: boolean, verificada: boolean, sesion: number, login: (user: UsuarioDePOS) => void, logout: () => Promise<void>} | null>} */
const POSAuthContext = createContext(null);

const CLAVE = 'posUser';

/**
 * Cada cuánto, como mínimo, se vuelve a preguntar quién está dentro al regresar a la pestaña.
 *
 * La cookie de sesión es del NAVEGADOR, no de la pestaña: si en otra pestaña entra otra
 * persona (o el dueño general cambia de demostración), esta sigue pintando al usuario
 * anterior mientras sus peticiones ya viajan como el nuevo. Un minuto basta para que eso
 * dure poco, y es una sola lectura ligera por regreso, no un sondeo.
 */
const REVALIDAR_DESPUES_DE_MS = 60_000;

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
 *
 * SIN COOKIE NO SE PREGUNTA (`conSesion`, que el servidor lee de la petición, igual que
 * para `ConfigProvider`). La respuesta ya se sabe —no hay nadie— y preguntarla escribía un
 * 401 en la consola de cada pantalla de acceso, antes de que nadie tecleara su PIN: el
 * rastreador lo cuenta como respuesta rota, y con razón, porque un 401 permanente enseña a
 * no mirar los que sí importan. Lo guardado de una sesión anterior se borra, como con ese 401.
 *
 * `verificada` (DP-10.1) dice que el SERVIDOR ya contestó —o que no se pudo preguntar—. Lo
 * guardado sirve para pintar la barra, pero la pantalla de Cocina no decide con ello qué
 * estación enseñar: podría ser de antes de que se la asignaran, o de antes de que la sesión
 * trajera la estación.
 */
export function POSAuthProvider({ children, conSesion = true }) {
  const [posUser, setPosUser] = useState(/** @type {UsuarioDePOS | null} */ (null));
  const [isLoading, setIsLoading] = useState(true);
  const [verificada, setVerificada] = useState(false);
  // Cuántas entradas y salidas EXPLÍCITAS ha habido. El caché de consultas parte de cero con
  // cada una (`ProveedorDeConsultas`), aunque vuelva a entrar el mismo empleo.
  const [sesion, setSesion] = useState(0);
  const version = useRef(0);

  useEffect(() => {
    if (!conSesion) {
      try {
        sessionStorage.removeItem(CLAVE);
      } catch {
        // Nada que borrar.
      }
      setPosUser(null);
      setIsLoading(false);
      setVerificada(true);
      return undefined;
    }
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
        if (fallo instanceof ErrorPuente && (fallo.estado === 401 || fallo.estado === 403)) {
          setPosUser(null);
          try {
            sessionStorage.removeItem(CLAVE);
          } catch {
            // Nada que borrar.
          }
        }
      })
      .finally(() => {
        if (!vigente) return;
        setIsLoading(false);
        setVerificada(true);
      });
    return () => {
      vigente = false;
    };
  }, [conSesion]);

  /**
   * AL REGRESAR A LA PESTAÑA se confirma que sigue dentro quien se pintaba.
   *
   * Sin esto la pregunta de arriba sólo se hace al montar, y una pestaña que lleva horas
   * abierta nunca se enteraba de que la cookie ya era de otra persona, ni de que la sesión
   * venció o se revocó. Distingue lo mismo que `me()`: 401/403 saca; un fallo de red no.
   * Si contesta OTRA identidad, se adopta —las peticiones ya viajan como ella— y el caché de
   * consultas se descarta con el cambio de contexto. Y si es la misma pero le cambiaron la
   * estación de cocina, también (DP-10.1): la pantalla de Cocina filtra con ella.
   */
  useEffect(() => {
    if (!conSesion) return undefined;
    let vigente = true;
    let ultimaPregunta = Date.now();
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaPregunta < REVALIDAR_DESPUES_DE_MS) return;
      ultimaPregunta = Date.now();
      const alPreguntar = version.current;
      api.auth
        .me()
        .then((delServidor) => {
          if (!vigente || version.current !== alPreguntar) return;
          setPosUser((actual) =>
            claveDeContexto(actual) === claveDeContexto(delServidor) &&
            mismaCocina(actual, delServidor)
              ? actual
              : delServidor,
          );
          try {
            sessionStorage.setItem(CLAVE, JSON.stringify(delServidor));
          } catch {
            // Sin almacenamiento (modo privado) la sesión sigue en la cookie.
          }
        })
        .catch((fallo) => {
          if (!vigente || version.current !== alPreguntar) return;
          if (fallo instanceof ErrorPuente && (fallo.estado === 401 || fallo.estado === 403)) {
            setPosUser(null);
            try {
              sessionStorage.removeItem(CLAVE);
            } catch {
              // Nada que borrar.
            }
          }
        });
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [conSesion]);

  const login = (user) => {
    // DP-11.2: entrar con el PIN quita el candado del modo espera que hubiera en el aparato.
    abrirElCandado(almacenDelAparato());
    version.current += 1;
    setSesion((n) => n + 1);
    setPosUser(user);
    setIsLoading(false);
    setVerificada(true);
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(user));
    } catch {
      // La cookie de sesión manda; esto sólo evita el parpadeo del siguiente montaje.
    }
  };

  const logout = async () => {
    await api.auth.salir();
    // DP-11.2: el candado del modo espera se quita sólo cuando el servidor cerró la sesión; si
    // `salir` falla, sigue puesto (una recarga no debe entrar sin el PIN).
    abrirElCandado(almacenDelAparato());
    // DP-11.3: suena la salida ANTES de soltar la sesión: sin sesión, la pantalla ya navega sola
    // a la entrada y la recarga de abajo llegaría encima. La recarga corta el audio.
    await sonarAntesDeIrse('salir');
    version.current += 1;
    setSesion((n) => n + 1);
    setPosUser(null);
    try {
      sessionStorage.removeItem(CLAVE);
    } catch {
      // Nada que borrar.
    }
    window.location.replace('/login-pos');
  };

  return (
    <POSAuthContext.Provider value={{ posUser, login, logout, isLoading, verificada, sesion }}>
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth() {
  const ctx = useContext(POSAuthContext);
  if (!ctx) throw new Error('usePOSAuth must be used within POSAuthProvider');
  return ctx;
}
