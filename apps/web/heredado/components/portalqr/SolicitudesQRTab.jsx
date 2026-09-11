'use client';
import React, { useMemo, useState } from 'react';
import { api } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Bell, Receipt, HelpCircle, CheckCircle2, Clock, Trash2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { TIPO_SOLICITUD_VERBO } from '@/utils/qrUtils';

const ESTADOS_LABEL = {
  pendiente: 'Pendiente',
  atendida: 'Atendida',
  resuelta: 'Resuelta',
  cancelada: 'Cancelada',
};

const TIPO_ICON = {
  ordenar: Bell,
  cuenta: Receipt,
  ayuda: HelpCircle,
};

const TIPO_COLOR = {
  ordenar: 'bg-amber-100 text-amber-800 border-amber-200',
  cuenta: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ayuda: 'bg-rose-100 text-rose-800 border-rose-200',
};

/**
 * Pestaña "Solicitudes" del Portal QR (vista admin) — historial completo.
 *
 * ── La atribución dejó de viajar en el cuerpo ─────────────────────────────
 * Atender y resolver mandaban `atendido_por_id`, `atendido_por_nombre` y la
 * `fecha_atendida` del reloj del NAVEGADOR. Con eso cualquiera se atribuía el
 * trabajo de otro —o se lo endosaba— desde la consola, y un teléfono con la
 * hora mal puesta escribía una atención en el futuro. `restaurante.atender_solicitud`
 * ni siquiera acepta esos campos: el empleo sale de la sesión y la fecha del
 * reloj del servidor. La regla de «quien lo tomó primero lo conserva» sigue,
 * pero ahora es la única forma de que salga.
 *
 * ── Y borrar dejó de ser un bucle ─────────────────────────────────────────
 * "Vaciar todas" bajaba 500 solicitudes al navegador y las borraba una por una
 * dentro de un `try {…} catch {}` VACÍO, contando sólo las que salían bien: si
 * fallaba la número 200, la pantalla decía «Solicitudes borradas: 199», las 301
 * restantes se quedaban a medias y no había transacción que revertir. Ahora son
 * dos comandos con un `delete` cada uno, y el número que se enseña es el que la
 * base dice que borró.
 */
export default function SolicitudesQRTab() {
  const queryClient = useQueryClient();
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [limpiando, setLimpiando] = useState(false);

  const refrescarListas = () => {
    queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_admin'] });
    queryClient.invalidateQueries({ queryKey: ['solicitudes_qr_mesero'] });
  };

  const limpiarAntiguas = async () => {
    if (limpiando) return;
    if (
      !confirm(
        'Esto borrará las solicitudes QR de días anteriores. ¿Continuar?\n\n(No se tocan ventas, mesas, pedidos ni cortes.)',
      )
    )
      return;
    setLimpiando(true);
    try {
      // Sólo las CERRADAS de hace más de 24 h. El corte por
      // `hora_inicio_dia_operativo` se leía en el navegador y se llevaba también
      // las PENDIENTES: el aviso que nadie atendió desaparecía sin dejar
      // constancia de que nadie lo atendió.
      const r = await api.comandos.ejecutar('/api/restaurante/limpiar-solicitudes', {});
      toast.success(`Solicitudes antiguas borradas: ${r?.borradas || 0}`);
      refrescarListas();
    } catch (err) {
      toast.error('No se pudo limpiar: ' + (err?.message || ''));
    } finally {
      setLimpiando(false);
    }
  };

  const vaciarDia = async () => {
    if (limpiando) return;
    if (
      !confirm(
        '⚠ Esto BORRARÁ TODAS las solicitudes QR (incluso las de hoy). ¿Continuar?\n\n(No se tocan ventas, mesas, pedidos ni cortes.)',
      )
    )
      return;
    setLimpiando(true);
    try {
      // Comando aparte del anterior, y no un `alcance: 'todas'`, porque
      // llevarse el historial entero del negocio es de dueño y administrador.
      const r = await api.comandos.ejecutar('/api/restaurante/vaciar-solicitudes', {});
      toast.success(`Solicitudes borradas: ${r?.borradas || 0}`);
      refrescarListas();
    } catch (err) {
      toast.error('No se pudo vaciar: ' + (err?.message || ''));
    } finally {
      setLimpiando(false);
    }
  };

  const { data: solicitudes = [] } = useQuery({
    queryKey: ['solicitudes_qr_admin'],
    queryFn: () => api.entidades.SolicitudQR.list('-created_date', 300),
    initialData: [],
    refetchInterval: 5000,
  });

  const filtradas = useMemo(() => {
    const arr = Array.isArray(solicitudes) ? solicitudes : [];
    if (filtroEstado === 'todas') return arr;
    if (filtroEstado === 'activas')
      return arr.filter((s) => s?.estado === 'pendiente' || s?.estado === 'atendida');
    return arr.filter((s) => s?.estado === filtroEstado);
  }, [solicitudes, filtroEstado]);

  const accion = async (s, accionTipo) => {
    if (!s?.id) return;
    if (accionTipo === 'cancelar' && !confirm('¿Cancelar esta solicitud?')) return;
    const estado =
      accionTipo === 'atender' ? 'atendida' : accionTipo === 'resolver' ? 'resuelta' : 'cancelada';
    try {
      // La transición es monotónica en el servidor: un toque que se quedó en la
      // red y llega tarde pidiendo «atendida» sobre un aviso ya resuelto NO lo
      // devuelve a la lista de pendientes del compañero.
      await api.comandos.ejecutar('/api/restaurante/atender-solicitud', {
        solicitudId: s.id,
        estado,
      });
      refrescarListas();
      toast.success('Solicitud actualizada');
    } catch (err) {
      // «Un compañero movió ese aviso mientras lo atendías», «Esa solicitud está
      // en "resuelta" y ya no puede pasar a…»: el dominio ya lo explica.
      toast.error(err?.message || 'No se pudo actualizar');
    }
  };

  const contar = (e) => (solicitudes || []).filter((s) => s?.estado === e).length;

  const filtros = [
    { key: 'activas', label: `Activas (${contar('pendiente') + contar('atendida')})` },
    { key: 'pendiente', label: `Pendientes (${contar('pendiente')})` },
    { key: 'atendida', label: `Atendidas (${contar('atendida')})` },
    { key: 'resuelta', label: `Resueltas (${contar('resuelta')})` },
    { key: 'todas', label: 'Todas' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {filtros.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltroEstado(f.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filtroEstado === f.key ? 'bg-primary text-white shadow-md' : 'bg-white border text-muted-foreground'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={limpiando}
            onClick={limpiarAntiguas}
            className="h-8 gap-1.5 text-xs"
          >
            <Calendar className="w-3.5 h-3.5" /> Limpiar antiguas
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={limpiando}
            onClick={vaciarDia}
            className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700"
          >
            <Trash2 className="w-3.5 h-3.5" /> Vaciar todas
          </Button>
        </div>
      </div>

      {filtradas.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Sin solicitudes en este filtro.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtradas.map((s) => {
          const Icon = TIPO_ICON[s.tipo] || Bell;
          const colorBadge = TIPO_COLOR[s.tipo] || 'bg-slate-100 text-slate-700 border-slate-200';
          const time = (() => {
            try {
              return s?.fecha_creacion
                ? formatDistanceToNow(new Date(s.fecha_creacion), { addSuffix: true, locale: es })
                : '—';
            } catch {
              return '—';
            }
          })();
          const esActiva = s?.estado === 'pendiente' || s?.estado === 'atendida';
          return (
            <div
              key={s.id}
              className={`rounded-xl border-2 p-3 bg-white ${esActiva ? 'border-amber-300' : 'border-slate-200'}`}
              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`w-10 h-10 rounded-lg border flex items-center justify-center ${colorBadge}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-sm">
                    Mesa {s.mesa_numero || '—'}{' '}
                    {TIPO_SOLICITUD_VERBO[s.tipo] || 'requiere atención'}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" /> {time}
                  </p>
                  <span
                    className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${esActiva ? 'bg-amber-100 text-amber-800' : s.estado === 'resuelta' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {ESTADOS_LABEL[s.estado] || s.estado}
                  </span>
                  {s.mesero_destino_nombre && (
                    <p className="text-[10px] text-primary mt-0.5">
                      Para: {s.mesero_destino_nombre}
                    </p>
                  )}
                  {!s.mesero_destino_id && s.ruteo_modo === 'general' && (
                    <p className="text-[10px] text-slate-500 mt-0.5">Cola general</p>
                  )}
                  {s.atendido_por_nombre && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Atendido por: {s.atendido_por_nombre}
                    </p>
                  )}
                </div>
              </div>
              {esActiva && (
                <div className="flex gap-1.5 mt-2">
                  {s.estado === 'pendiente' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-1"
                      onClick={() => accion(s, 'atender')}
                    >
                      Atender
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-7 text-xs flex-1"
                    onClick={() => accion(s, 'resolver')}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Resolver
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-slate-500"
                    onClick={() => accion(s, 'cancelar')}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
