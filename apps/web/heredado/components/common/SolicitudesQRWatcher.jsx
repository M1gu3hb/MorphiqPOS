'use client';
import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/cliente';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { ROLES } from '@/lib/constants';
import { playNewOrder } from '@/lib/sounds';
import { speak, frasePorSolicitud, getAlertConfig } from '@/lib/voiceAlert';
import { TIPO_SOLICITUD_VERBO } from '@/utils/qrUtils';
import { toast } from 'sonner';
import {
  debeEscucharAudio,
  debeUsarNombreEnVoz,
  filtrarSolicitudesParaUsuario,
  cleanupOldSolicitudes,
} from '@/lib/asignacionMesas';

/**
 * Watcher global de solicitudes QR.
 *
 * Reglas de notificación:
 * - Solo activo en Restaurante Pro + portal activo + rol mesero/admin.
 * - El ADMIN puede ver el toast siempre, pero NO escucha audio/voz si
 *   silenciar_notificaciones_admin = true (default).
 * - El MESERO con asignación activa solo recibe sus solicitudes (mesero_destino_id == él
 *   o solicitudes sin asignar).
 * - El MESERO sin asignación recibe toda la cola general.
 * - La voz usa el NOMBRE del mesero solo si la asignación está activa y la
 *   solicitud tiene destino claro; si no, frase genérica.
 * - Notifica únicamente eventos nuevos (no spam tras refresh).
 */
const NOTIFIED_KEY = 'mh_notified_solicitudes_qr';

const loadSet = () => {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};
const saveSet = (set) => {
  try {
    sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set].slice(-200)));
  } catch {}
};

export default function SolicitudesQRWatcher() {
  const { posUser } = usePOSAuth();
  const { paquete_modo, config } = useConfig();
  const role = posUser?.rol;

  const isPro = paquete_modo === 'restaurante_pro';
  const portalActivo = config?.portal_qr_activo === true;
  const watch = isPro && portalActivo && (role === ROLES.WAITER || role === ROLES.ADMIN);

  const firstLoadRef = useRef(true);
  const notifiedRef = useRef(loadSet());
  const cleanupDoneRef = useRef(false);

  // Limpieza diaria: una sola vez por sesión, al primer mount habilitado.
  useEffect(() => {
    if (!watch || cleanupDoneRef.current) return;
    cleanupDoneRef.current = true;
    // Ejecutar sin bloquear render.
    //
    // El `.catch(() => {})` que había aquí anulaba el trabajo de
    // `cleanupOldSolicitudes`, que se reescribió para LANZAR en vez de tragarse
    // el fallo: el silencio sólo cambió de sitio. Ahora se anota.
    //
    // No sale un aviso en pantalla A PROPÓSITO: esto es mantenimiento de fondo
    // que corre solo al montar, y el mesero no puede hacer nada con «no se
    // pudieron limpiar los avisos antiguos» mientras atiende una mesa. Que no
    // se limpien no rompe nada —la lista sigue funcionando, sólo más larga—,
    // así que degradar en silencio VISIBLE y ruidoso en la consola es lo
    // correcto. Lo que no vale es que no quede rastro en ninguna parte.
    cleanupOldSolicitudes(api, config).catch((e) => {
      console.warn('[SolicitudesQRWatcher] limpieza de avisos antiguos:', e);
    });
  }, [watch, config]);

  const { data: solicitudes = [] } = useQuery({
    queryKey: ['solicitudes_qr_watcher'],
    queryFn: () => api.entidades.SolicitudQR.filter({ estado: 'pendiente' }),
    initialData: [],
    refetchInterval: 5000,
    enabled: watch,
  });

  useEffect(() => {
    if (!watch) return;
    const todas = Array.isArray(solicitudes) ? solicitudes : [];
    // Filtramos según rol/asignación: el watcher debe notificar solo lo que le toca.
    const pendientes = filtrarSolicitudesParaUsuario(todas, posUser, config);

    if (firstLoadRef.current) {
      // Marcar TODAS las del primer load (sin importar filtro) como ya vistas
      // para evitar spam al entrar.
      todas.forEach((s) => notifiedRef.current.add(s.id));
      saveSet(notifiedRef.current);
      firstLoadRef.current = false;
      return;
    }
    const nuevas = pendientes.filter((s) => !notifiedRef.current.has(s.id));
    if (nuevas.length === 0) return;

    const alertCfg = getAlertConfig();
    const audioOk = debeEscucharAudio(posUser, config);
    const conSonido = audioOk && (alertCfg.modo === 'sonido' || alertCfg.modo === 'sonido_voz');
    const conVoz = audioOk && (alertCfg.modo === 'voz' || alertCfg.modo === 'sonido_voz');

    const frasesAHablar = [];
    nuevas.forEach((s) => {
      notifiedRef.current.add(s.id);
      const verbo = TIPO_SOLICITUD_VERBO[s.tipo] || 'requiere atención';
      // PRIMERO visual (toast).
      toast.success('Solicitud QR', {
        description: `Mesa ${s.mesa_numero || '—'} ${verbo}`,
        duration: 10000,
      });
      if (conVoz) {
        const puedeNombrar = debeUsarNombreEnVoz(config, s);
        const propio = !!s?.mesero_destino_id && s.mesero_destino_id === posUser?.id;
        const nombre = puedeNombrar && propio && alertCfg.decir_nombre ? posUser?.nombre || '' : '';
        frasesAHablar.push(frasePorSolicitud(s.tipo, s.mesa_numero, nombre));
      }
    });

    saveSet(notifiedRef.current);
    // Visual → voz/sonido con pequeño delay.
    if (conSonido || frasesAHablar.length > 0) {
      setTimeout(() => {
        if (conSonido) {
          try {
            playNewOrder();
          } catch {}
        }
        frasesAHablar.forEach((frase, i) => {
          setTimeout(() => {
            try {
              speak(frase);
            } catch {}
          }, i * 1400);
        });
      }, 280);
    }
  }, [solicitudes, watch, posUser, config]);

  return null;
}
