'use client';
import React, { useState, useMemo } from 'react';
import { api } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { QrCode, Search, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { generarTokenMesa, buildPortalQRUrl } from '@/utils/qrUtils';
import QRMesaDialog from './QRMesaDialog';
import QRCanvas from './QRCanvas';

/**
 * Pestaña "Mesas QR": admin ve sus mesas y administra el QR de cada una.
 * NO permite operación de pedidos.
 */
export default function MesasQRTab({ config }) {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [mesaActiva, setMesaActiva] = useState(null);

  const { data: mesas = [], isLoading } = useQuery({
    queryKey: ['mesas_qr_admin'],
    queryFn: () => api.entidades.Mesa.list('orden', 200),
    initialData: [],
  });

  // Mesas sin token: las inicializa con uno automáticamente la primera vez que
  // se abren. `qr_token` y `qr_activo` NO son campos bloqueados del puente:
  // esta escritura se queda como está. Lo que se va es el `catch` que devolvía
  // la mesa SIN token como si nada hubiera pasado, y detrás se abría el diálogo
  // con un QR que no existía.
  const asegurarToken = async (mesa) => {
    if (!mesa?.id || mesa.qr_token) return mesa;
    const token = await generarTokenMesa(mesa.id);
    queryClient.invalidateQueries({ queryKey: ['mesas_qr_admin'] });
    return { ...mesa, qr_token: token };
  };

  const regenerarTokens = async () => {
    if (!confirm('¿Generar token QR para todas las mesas que no lo tengan?')) return;
    try {
      const pendientes = (mesas || []).filter((m) => m && !m.qr_token);
      // Sin `.catch(() => {})` por mesa: contaba las que se INTENTARON, no las
      // que se guardaron, así que el toast decía «Tokens generados (12)» con
      // doce mesas sin QR. Si una falla, falla el lote y se dice.
      await Promise.all(pendientes.map((m) => generarTokenMesa(m.id)));
      queryClient.invalidateQueries({ queryKey: ['mesas_qr_admin'] });
      toast.success(`Tokens generados (${pendientes.length})`);
    } catch (err) {
      toast.error(err?.message || 'No se pudo generar tokens');
    }
  };

  const toggleActivo = async (mesa, value) => {
    if (!mesa?.id) return;
    try {
      await api.entidades.Mesa.update(mesa.id, { qr_activo: !!value });
      queryClient.invalidateQueries({ queryKey: ['mesas_qr_admin'] });
    } catch (err) {
      toast.error(err?.message || 'No se pudo actualizar');
    }
  };

  const verQR = async (mesa) => {
    try {
      setMesaActiva(await asegurarToken(mesa));
    } catch (err) {
      // Sin token no hay QR que enseñar: se dice, en vez de abrir el diálogo
      // con un código vacío.
      toast.error(err?.message || 'No se pudo generar el QR de esta mesa');
    }
  };

  const filtradas = useMemo(() => {
    const arr = Array.isArray(mesas) ? mesas : [];
    if (!busqueda) return arr;
    const q = busqueda.toLowerCase();
    return arr.filter(
      (m) =>
        String(m?.numero || '').includes(q) ||
        (m?.nombre || '').toLowerCase().includes(q) ||
        (m?.zona || '').toLowerCase().includes(q),
    );
  }, [mesas, busqueda]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar mesa por número, nombre o zona..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={regenerarTokens} className="gap-2">
          <RefreshCcw className="w-4 h-4" /> Generar tokens faltantes
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground text-center py-6">Cargando mesas...</p>
      )}

      {!isLoading && filtradas.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <QrCode className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No hay mesas configuradas.</p>
          <p className="text-xs">Crea mesas en Configuración → Mapa de mesas.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtradas.map((mesa) => {
          const url = buildPortalQRUrl(mesa);
          const activo = mesa?.qr_activo !== false;
          return (
            <div
              key={mesa.id}
              className="premium-sheen rounded-xl border bg-card text-card-foreground p-4 flex gap-3 items-start"
              style={{
                boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 3px 8px rgba(0,0,0,0.18)',
              }}
            >
              <div className="shrink-0 rounded-lg p-1.5 bg-white border">
                {mesa.qr_token ? (
                  <QRCanvas value={url} size={70} />
                ) : (
                  <div className="w-[70px] h-[70px] flex items-center justify-center text-[10px] text-muted-foreground">
                    Sin token
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-bold text-base leading-tight">
                  Mesa {mesa.numero}
                  {mesa?.nombre ? ` · ${mesa.nombre}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mesa?.zona || 'Interior'} · cap. {mesa?.capacidad || 0}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Switch checked={activo} onCheckedChange={(v) => toggleActivo(mesa, v)} />
                  <span
                    className={`text-xs font-semibold ${activo ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    {activo ? 'QR activo' : 'QR inactivo'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => verQR(mesa)}
                  >
                    Ver QR
                  </Button>
                  {mesa.qr_token && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => window.open(url, '_blank', 'noopener')}
                    >
                      Abrir portal
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <QRMesaDialog
        mesa={mesaActiva}
        open={!!mesaActiva}
        onClose={() => setMesaActiva(null)}
        config={config}
      />
    </div>
  );
}
