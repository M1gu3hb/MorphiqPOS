'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

import { almacenDelAparato } from '~/restaurante/vista-de-solicitudes';
import { usePantallaEncendida } from '~/telefono-de-cocina/use-pantalla-encendida';

import { CLAVE_DEL_CANDADO, abrir, cerrar, estaCerrado } from './candado-del-pin';
import { alDespertar, estaBloqueada } from './despertador';
import { leerPreferenciaDeEspera } from './preferencia-del-aparato';
import { decidirEspera, minutosDe, type PuestoDeEspera } from './reglas';

/** Cada cuánto se mira el reloj. El modo espera no necesita más precisión que ésta. */
const CADA_MS = 5_000;
const ACTIVIDAD = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
const ATRIBUTO_DE_LA_DECISION = 'data-espera-decision';

export type FaseDeEspera = 'despierta' | 'dormida' | 'pin';

/** Lo del PIN al despertar: si el negocio lo pide y de quién es la sesión. */
export interface CandadoDeEspera {
  readonly pedirPin: boolean;
  readonly empleoId: string | null;
}

/**
 * CUÁNDO DORMIR Y CUÁNDO DESPERTAR (DP-11.2).
 *
 * Cuenta la actividad de toda la pestaña (tocar, mover el ratón, teclear, desplazar); cada cinco
 * segundos mira si ya pasaron los minutos de ESTE aparato en ESTE puesto, sin nada que la
 * mantenga despierta (Cocina con comandas pendientes). Despertar lo pide un toque o el aviso de
 * una pantalla (comanda nueva, cuenta pedida).
 *
 * Con «Pedir PIN al despertar», al dormirse se pone el candado del PIN (`candado-del-pin.ts`):
 * vive en el aparato, así que una recarga o cambiar de ruta no lo quitan, y vale también cuando
 * la despierta un aviso (ver la cuenta no es poder cobrarla). La pantalla del PIN vuelve a
 * dormirse a los 30 s sin tocar. Sólo el PIN correcto (`volver`) lo quita, o entrar con PIN y
 * cerrar la sesión (`POSAuthContext`). Al despertar se decide otra vez con lo que el negocio pide
 * AHORA: al dormirse se avisa (`alDormir`) para volver a leer la configuración. Otra pestaña del
 * aparato que pone o quita el candado se nota aquí también (evento `storage`).
 *
 * Mientras el puesto admite espera y el aparato la tiene encendida, pide Wake Lock: el sistema
 * operativo no apaga la pantalla antes que el modo espera.
 */
export function useModoEspera(
  puesto: PuestoDeEspera | null,
  candado: CandadoDeEspera,
  alDormir: () => void,
): {
  readonly fase: FaseDeEspera;
  readonly dormidaDesde: number | null;
  readonly pedirDespertar: () => void;
  readonly volver: () => void;
} {
  const { pedirPin, empleoId } = candado;
  const [dormidaDesde, setDormidaDesde] = useState<number | null>(null);
  const [cerrada, setCerrada] = useState(
    () => pedirPin && empleoId !== null && estaCerrado(almacenDelAparato(), empleoId),
  );
  const [activa, setActiva] = useState(() => leerPreferenciaDeEspera(almacenDelAparato()).activa);
  // Se marca al montar (en el efecto de abajo): leer el reloj al pintar no es puro.
  const ultimaActividad = useRef(0);
  // La misma marca que `dormidaDesde`, para leerla desde los avisos sin esperar a pintar.
  const desdeRef = useRef<number | null>(null);
  // Lo del candado, para el reloj de cinco segundos (que no se rehace con cada cambio).
  const vigente = useRef({ pedirPin, empleoId, cerrada });
  useEffect(() => {
    vigente.current = { pedirPin, empleoId, cerrada };
  }, [pedirPin, empleoId, cerrada]);

  const volver = useCallback(() => {
    abrir(almacenDelAparato());
    ultimaActividad.current = Date.now();
    desdeRef.current = null;
    setCerrada(false);
    setDormidaDesde(null);
  }, []);

  const pedirDespertar = useCallback(() => {
    ultimaActividad.current = Date.now();
    if (desdeRef.current === null) return;
    desdeRef.current = null;
    setDormidaDesde(null);
    // El candado, con lo que el negocio pide ahora (la configuración se volvió a leer al dormirse).
    const { pedirPin: conPin, empleoId: empleo } = vigente.current;
    if (conPin && empleo !== null) {
      cerrar(almacenDelAparato(), empleo);
      setCerrada(true);
    } else if (!conPin) {
      abrir(almacenDelAparato());
      setCerrada(false);
    }
  }, []);

  useEffect(() => {
    const alCambiar = (evento: StorageEvent): void => {
      if (evento.key !== null && evento.key !== CLAVE_DEL_CANDADO) return;
      setCerrada(empleoId !== null && estaCerrado(almacenDelAparato(), empleoId));
    };
    window.addEventListener('storage', alCambiar);
    return () => {
      window.removeEventListener('storage', alCambiar);
    };
  }, [empleoId]);

  const avisarAlDormir = useEffectEvent(alDormir);

  useEffect(() => {
    ultimaActividad.current = Date.now();
    const anotar = (): void => {
      ultimaActividad.current = Date.now();
    };
    for (const evento of ACTIVIDAD) {
      window.addEventListener(evento, anotar, { capture: true, passive: true });
    }
    const soltar = alDespertar(pedirDespertar);
    return () => {
      for (const evento of ACTIVIDAD) window.removeEventListener(evento, anotar, { capture: true });
      soltar();
    };
  }, [pedirDespertar]);

  useEffect(() => {
    const documento = document.documentElement;
    const revisar = (): void => {
      // Se vuelve a leer cada vez: si alguien la apagó en Configuración → Este aparato, cuenta ya.
      const preferencia = leerPreferenciaDeEspera(almacenDelAparato());
      const { pedirPin: conPin, empleoId: empleo, cerrada: conCandado } = vigente.current;
      // Si el negocio dejó de pedir el PIN, un candado viejo no debe cerrar la próxima vez.
      if (!conPin) abrir(almacenDelAparato());
      setActiva(preferencia.activa);
      const decision = decidirEspera({
        puesto,
        activa: preferencia.activa,
        ahora: Date.now(),
        ultimaActividad: ultimaActividad.current,
        minutos: puesto === null ? 0 : minutosDe(puesto, preferencia.minutos),
        bloqueada: estaBloqueada(),
        cerrada: conPin && conCandado,
      });
      documento.setAttribute(ATRIBUTO_DE_LA_DECISION, decision);
      if (decision !== 'dormir' || desdeRef.current !== null) return;
      desdeRef.current = Date.now();
      setDormidaDesde(desdeRef.current);
      avisarAlDormir();
      if (conPin && empleo !== null) {
        cerrar(almacenDelAparato(), empleo);
        setCerrada(true);
      }
    };
    if (puesto === null) {
      documento.setAttribute(ATRIBUTO_DE_LA_DECISION, 'fuera');
      return () => {
        documento.removeAttribute(ATRIBUTO_DE_LA_DECISION);
      };
    }
    const reloj = window.setInterval(revisar, CADA_MS);
    return () => {
      window.clearInterval(reloj);
      documento.removeAttribute(ATRIBUTO_DE_LA_DECISION);
      // Al cambiar de pantalla, la espera de la anterior no se queda guardada para cuando vuelva.
      desdeRef.current = null;
      setDormidaDesde(null);
    };
  }, [puesto]);

  usePantallaEncendida(puesto !== null && activa);

  // En una pantalla donde no entra (el mesero), nunca está dormida aunque lo estuviera antes;
  // el candado del PIN, en cambio, vale en todas.
  const desde = puesto === null ? null : dormidaDesde;
  const conCandado = pedirPin && empleoId !== null && cerrada;
  const fase: FaseDeEspera = desde !== null ? 'dormida' : conCandado ? 'pin' : 'despierta';
  return { fase, dormidaDesde: desde, pedirDespertar, volver };
}
