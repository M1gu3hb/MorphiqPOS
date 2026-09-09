'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ErrorApi, invocarComando, obtenerApi } from '@/cliente/api';

import { ROLE_HOME_ROUTES } from './constants.ts';
import { usePOSAuth } from './POSAuthContext.tsx';
import { etiquetaDeRol, rolMH } from './roles.ts';

/**
 * La lógica de su pantalla de acceso: usuarios, PIN, teclado y entrada.
 *
 * Sale de `POSLogin.jsx` a un hook para que la pantalla se quede en lo que
 * dibuja y ninguno de los dos archivos pase de 300 líneas. El comportamiento es
 * el suyo: cuatro dígitos y entra solo, `Backspace` borra, `Enter` entra,
 * `Escape` limpia y deselecciona.
 *
 * ── LO QUE NO SE NEGOCIA ──────────────────────────────────────────────────
 * Su `tryLogin` hacía esto:
 *
 *     const found = usuarios.find(u => u.pin === pinToUse && …)
 *
 * en el NAVEGADOR, con los PIN de toda la plantilla descargados en memoria.
 * Ese era el agujero P0-01. Ahora la comprobación es una petición al servidor,
 * que verifica con Argon2id y pimienta contra un hash que nunca sale de la
 * base, cuenta los intentos fallidos y bloquea. El navegador no ve ni un PIN
 * ajeno ni un hash.
 *
 * ── La consecuencia visible, dicha en voz alta ────────────────────────────
 * El servidor necesita saber DE QUIÉN es el PIN que le mandan: probarlo contra
 * cada empleado sería exactamente el barrido que el límite por IP existe para
 * frenar. Así que hay que tocar el nombre antes de teclear.
 *
 * Cuando el negocio tiene una sola persona dada de alta, se selecciona sola y
 * el flujo queda idéntico al suyo: se teclean cuatro dígitos y se entra.
 */

export interface EmpleadoParaEntrar {
  readonly empleoId: string;
  readonly nombre: string;
  readonly rol: string;
}

interface RespuestaEmpleados {
  readonly negocio: string;
  readonly empleados: readonly EmpleadoParaEntrar[];
}

interface RespuestaEntrar {
  readonly organizacionId: string;
  readonly rol: string;
  readonly nombre: string;
}

const LARGO_PIN = 4;

export interface AccesoPin {
  readonly pin: string;
  readonly loading: boolean;
  readonly usuarios: readonly EmpleadoParaEntrar[];
  readonly usuariosCargando: boolean;
  readonly usuariosError: boolean;
  readonly selectedUser: EmpleadoParaEntrar | null;
  readonly cargarUsuarios: () => Promise<void>;
  readonly seleccionar: (usuario: EmpleadoParaEntrar) => void;
  readonly pulsar: (tecla: string) => void;
  readonly borrar: () => void;
}

export function useAccesoPin(alEntrar: (ruta: string) => void): AccesoPin {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState<readonly EmpleadoParaEntrar[]>([]);
  // 6A.3: distinguir "todavía cargando" de "ya cargó y está vacío" para
  // no mostrar "Sin usuarios activos" antes del primer fetch en móvil.
  const [usuariosCargando, setUsuariosCargando] = useState(true);
  const [usuariosError, setUsuariosError] = useState(false);
  const [selectedUser, setSelectedUser] = useState<EmpleadoParaEntrar | null>(null);
  const { login } = usePOSAuth();
  const clienteConsultas = useQueryClient();

  // Dos refs, cada uno por su razón:
  //   · `entrando` evita que un doble toque en el cuarto dígito mande dos
  //     peticiones de entrada con el mismo PIN;
  //   · `pinRef` guarda el PIN que se está tecleando para poder decidir «ya son
  //     cuatro, entra» EN EL MANEJADOR y no en un efecto que observe el estado.
  //     Entrar es una consecuencia de teclear, no de que el estado cambie.
  const entrando = useRef(false);
  const pinRef = useRef('');

  const cargarUsuarios = useCallback(async () => {
    setUsuariosCargando(true);
    setUsuariosError(false);
    try {
      const datos = await obtenerApi<RespuestaEmpleados>('/api/auth/empleados');
      setUsuarios(datos.empleados);
      // Un negocio de una sola persona no tiene nada que elegir.
      if (datos.empleados.length === 1) setSelectedUser(datos.empleados[0] ?? null);
      setUsuariosError(false);
    } catch (err) {
      console.error('[POSLogin] cargar usuarios:', err);
      setUsuariosError(true);
    } finally {
      setUsuariosCargando(false);
    }
  }, []);

  useEffect(() => {
    // Sincroniza con un sistema externo —la plantilla que sirve el servidor— al
    // montar. El `setState` ocurre dentro de la promesa, no en el cuerpo del
    // efecto, pero la regla no puede distinguirlo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarUsuarios();
  }, [cargarUsuarios]);

  const tryLogin = useCallback(
    async (pinToUse: string, usuario: EmpleadoParaEntrar | null) => {
      if (pinToUse.length < LARGO_PIN) return;
      if (usuario === null) {
        toast.error('Toca tu nombre para entrar');
        pinRef.current = '';
        setPin('');
        return;
      }
      if (entrando.current) return;

      entrando.current = true;
      setLoading(true);
      try {
        const datos = await invocarComando<RespuestaEntrar>('/api/auth/entrar', {
          empleoId: usuario.empleoId,
          pin: pinToUse,
        });
        const rol = rolMH(datos.rol);
        login({
          nombre: datos.nombre,
          rol: rol ?? '',
          etiqueta: etiquetaDeRol(datos.rol),
        });
        // La configuracion se pidio ANTES de entrar y respondio 401, asi que
        // en cache esta el fallo. Sin invalidarla, el negocio se llamaria «MH
        // Astral Systems» y el paquete seria el de reserva hasta el siguiente
        // foco de ventana: la barra lateral ensenaria menus que este negocio no
        // tiene contratados.
        await clienteConsultas.invalidateQueries({ queryKey: ['config'] });
        toast.success(`Bienvenido, ${datos.nombre}`);
        alEntrar(rol === null ? '/' : (ROLE_HOME_ROUTES[rol] ?? '/'));
      } catch (error) {
        // El servidor ya decidió qué se puede decir: PIN incorrecto, demasiados
        // intentos, o el bloqueo con sus minutos. Aquí no se reinterpreta.
        toast.error(error instanceof ErrorApi ? error.error.mensaje : 'PIN incorrecto');
        pinRef.current = '';
        setPin('');
      } finally {
        entrando.current = false;
        setLoading(false);
      }
    },
    [login, alEntrar, clienteConsultas],
  );

  const fijarPin = useCallback((valor: string) => {
    pinRef.current = valor;
    setPin(valor);
  }, []);

  const pulsar = useCallback(
    (key: string) => {
      if (entrando.current) return;
      if (pinRef.current.length >= LARGO_PIN) return;
      const siguiente = pinRef.current + key;
      fijarPin(siguiente);
      // El cuarto dígito entra solo, igual que en su pantalla.
      if (siguiente.length === LARGO_PIN) void tryLogin(siguiente, selectedUser);
    },
    [fijarPin, tryLogin, selectedUser],
  );

  const borrar = useCallback(() => {
    fijarPin(pinRef.current.slice(0, -1));
  }, [fijarPin]);

  const seleccionar = useCallback(
    (usuario: EmpleadoParaEntrar) => {
      setSelectedUser(usuario);
      fijarPin('');
    },
    [fijarPin],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (entrando.current) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        pulsar(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        borrar();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pinRef.current.length >= LARGO_PIN) void tryLogin(pinRef.current, selectedUser);
      } else if (e.key === 'Escape') {
        fijarPin('');
        setSelectedUser(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [pulsar, borrar, fijarPin, tryLogin, selectedUser]);

  return {
    pin,
    loading,
    usuarios,
    usuariosCargando,
    usuariosError,
    selectedUser,
    cargarUsuarios,
    seleccionar,
    pulsar,
    borrar,
  };
}
