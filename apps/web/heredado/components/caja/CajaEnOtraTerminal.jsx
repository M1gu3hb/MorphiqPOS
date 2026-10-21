'use client';
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, MonitorSmartphone } from 'lucide-react';
import { api } from '@/api/cliente';
import { Button } from '@/components/ui/button';

/**
 * LA CAJA ESTÁ ABIERTA EN OTRA TERMINAL (21-10-2026).
 *
 * La caja es de una terminal —la cookie de un navegador—. Quien la abrió en la
 * computadora y entra desde el teléfono veía «No hay caja abierta» y un «Abrir caja»
 * que fallaba con «ya hay una abierta en Caja 20»: parecía que la caja se había cerrado
 * sola. Este aviso dice dónde está, quién la abrió y desde cuándo, y la trae a este
 * dispositivo (`/api/caja/traer`) para cobrar y hacer su corte aquí. Si la abrió otra
 * persona y quien mira no es de la gerencia, sólo lo explica.
 */
export default function CajaEnOtraTerminal({ caja }) {
  const queryClient = useQueryClient();
  const [trayendo, setTrayendo] = useState(false);

  const desde = new Date(caja.abiertaEn).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const donde = caja.terminalNombre ? `«${caja.terminalNombre}»` : 'otra terminal';
  const quien = caja.abiertaPor ? ` La abrió ${caja.abiertaPor}` : ' Se abrió';

  const traer = async () => {
    if (trayendo) return;
    setTrayendo(true);
    try {
      await api.comandos.ejecutar('/api/caja/traer', { sesionCajaId: caja.sesionCajaId });
      await queryClient.invalidateQueries({ queryKey: ['cortes_caja_estado'] });
      toast.success('Listo: la caja ya está en este dispositivo. Puedes cobrar y hacer el corte.');
    } catch (err) {
      toast.error(err?.message || 'No se pudo traer la caja');
    } finally {
      setTrayendo(false);
    }
  };

  return (
    <div
      role="status"
      className="px-4 py-3 rounded-xl bg-advertencia/10 border-2 border-advertencia/30 text-sm text-advertencia flex items-start gap-3"
    >
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-advertencia" />
      <div className="flex-1">
        <p className="font-bold">La caja está abierta en {donde}</p>
        <p className="text-xs opacity-90">
          {quien} el {desde}.{' '}
          {caja.puedoTraerla
            ? 'Úsala aquí para cobrar y hacer su corte desde este dispositivo.'
            : 'Pide a quien la abrió o a la gerencia que la traiga a este dispositivo, o que haga su corte.'}
        </p>
      </div>
      {caja.puedoTraerla && (
        <Button size="sm" onClick={traer} disabled={trayendo} className="shrink-0">
          <MonitorSmartphone className="w-4 h-4 mr-1" />
          {trayendo ? 'Trayendo…' : 'Usar esta caja aquí'}
        </Button>
      )}
    </div>
  );
}
