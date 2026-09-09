'use client';
import React, { useState, useMemo } from 'react';
import { api } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { hasPermission } from '@/lib/permissions';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import LoadingState from '@/components/common/LoadingState';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Receipt, Search, Trash2, AlertTriangle, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import TicketViewerDialog from '@/components/tickets/TicketViewerDialog';
import { useConfig } from '@/lib/ConfigContext';

const ESTADO_COLORS = {
  pagada: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-red-100 text-red-700',
  abierta: 'bg-blue-100 text-blue-700',
  en_preparacion: 'bg-orange-100 text-orange-700',
};

export default function Ventas() {
  const { posUser } = usePOSAuth();
  const { config } = useConfig();
  const colorize = config?.colorear_importes_monetarios !== false;
  const queryClient = useQueryClient();
  const puedeLimpiar = hasPermission(posUser?.rol, 'limpiar_ventas');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');
  const [selectedVenta, setSelectedVenta] = useState(null);
  const [showLimpiar, setShowLimpiar] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [limpiando, setLimpiando] = useState(false);
  const [revertirInventario, setRevertirInventario] = useState(true);
  const [verTicket, setVerTicket] = useState(null);

  // No usar initialData:[] (genera "sin ventas" antes del primer fetch).
  const { data: ventas, isPending: ventasLoading } = useQuery({
    queryKey: ['ventas_all'],
    queryFn: () => api.entidades.Venta.list('-created_date', 200),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const safeVentas = Array.isArray(ventas) ? ventas : [];
  const cargandoVentas = ventasLoading && !ventas;

  const { data: detalles = [] } = useQuery({
    queryKey: ['detalles_venta', selectedVenta?.id],
    queryFn: () => api.entidades.DetalleVenta.filter({ venta_id: selectedVenta.id }),
    enabled: !!selectedVenta,
    initialData: [],
  });

  const filtered = useMemo(() => {
    return safeVentas.filter((v) => {
      const matchSearch =
        !search ||
        v.folio?.toLowerCase().includes(search.toLowerCase()) ||
        v.usuario_cajero_nombre?.toLowerCase().includes(search.toLowerCase());
      const matchEstado = filterEstado === 'all' || v.estado === filterEstado;
      return matchSearch && matchEstado;
    });
  }, [safeVentas, search, filterEstado]);

  const totalVentas = filtered
    .filter((v) => v.estado === 'pagada')
    .reduce((s, v) => s + (v.total || 0), 0);

  const handleLimpiar = async () => {
    setLimpiando(true);
    try {
      const res = await api.funciones.invocar('limpiarVentas', {
        rol: posUser?.rol,
        revertirInventario,
      });
      if (res?.data?.ok) {
        toast.success('Ventas de prueba limpiadas correctamente');
        [
          'ventas_all',
          'ventas_pendientes_caja',
          'ventas_pagadas_caja',
          'pedidos_cocina',
          'mesas',
          'cortes',
          'cortes_historial',
          'gastos_hoy',
          'detalles_venta',
          'ingredientes_all',
          'descuentos_hoy',
          'movimientos_inv',
          'registros_ventas',
          'registros_cortes',
          'registros_movimientos',
        ].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      } else {
        toast.error(res?.data?.error || 'Error al limpiar');
      }
    } catch (e) {
      toast.error('Error: ' + (e.message || ''));
    }
    setLimpiando(false);
    setShowLimpiar(false);
    setConfirmText('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de ventas"
        description={`${filtered.length} transacciones · Total: ${formatCurrency(totalVentas)}`}
        actions={
          puedeLimpiar && (
            <Button variant="destructive" size="sm" onClick={() => setShowLimpiar(true)}>
              <Trash2 className="w-4 h-4 mr-1" />
              Limpiar ventas de prueba
            </Button>
          )
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar folio o cajero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pagada">Pagadas</SelectItem>
            <SelectItem value="abierta">Abiertas</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cargandoVentas ? (
        <LoadingState label="Cargando ventas…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Sin ventas"
          description="No hay transacciones registradas aún"
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <Card
              key={v.id}
              className="premium-sheen p-4 hover:shadow-sm transition-shadow bg-white/80 backdrop-blur-sm"
            >
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedVenta(v)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-bold">{v.folio}</span>
                    <Badge
                      className={`${ESTADO_COLORS[v.estado] || 'bg-gray-100 text-gray-600'} text-[10px] border-0`}
                    >
                      {v.estado}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {v.tipo_venta}
                    </Badge>
                    {v.mesa_numero && (
                      <Badge variant="outline" className="text-[10px]">
                        Mesa {v.mesa_numero}
                      </Badge>
                    )}
                    {/* Valoración del comensal (Prompt 6C). Solo lectura. */}
                    {v.satisfaccion_score && v.satisfaccion_emoji && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/60 border text-[10px] font-semibold"
                        title={v.satisfaccion_label || ''}
                      >
                        <span className="text-sm leading-none">{v.satisfaccion_emoji}</span>
                        <span>{v.satisfaccion_label || `${v.satisfaccion_score}/5`}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {v.fecha_cierre
                      ? format(new Date(v.fecha_cierre), 'd MMM yyyy, HH:mm', { locale: es })
                      : 'Abierta'}
                    {v.usuario_cajero_nombre && ` · ${v.usuario_cajero_nombre}`}
                  </div>
                  {v.satisfaccion_comentario && (
                    <p className="text-[11px] italic text-muted-foreground mt-0.5 line-clamp-2">
                      💬 “{v.satisfaccion_comentario}”
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold text-lg text-foreground">
                    {formatCurrency(v.total)}
                  </p>
                  {v.margen_snapshot > 0 && (
                    <p
                      className={`text-xs ${colorize ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'}`}
                    >
                      {formatPercent(v.margen_snapshot)} margen
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{v.metodo_pago || '—'}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setVerTicket(v);
                  }}
                >
                  <Printer className="w-3.5 h-3.5 mr-1" /> Ver ticket
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* LIMPIAR DIALOG */}
      <Dialog open={showLimpiar} onOpenChange={setShowLimpiar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Limpiar ventas de prueba
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              <p className="font-bold mb-1">⚠ Esta acción es irreversible</p>
              <p className="text-xs">
                Esto borrará <strong>todas las ventas, cobros pendientes, pedidos y cortes</strong>.
                Dejará el dashboard en ceros y reseteará las mesas a libre.
              </p>
              <p className="text-xs mt-2">
                No se borrarán: productos, recetas, ingredientes, inventario, configuración,
                usuarios ni mesas.
              </p>
            </div>
            <label className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/30 cursor-pointer">
              <input
                type="checkbox"
                checked={revertirInventario}
                onChange={(e) => setRevertirInventario(e.target.checked)}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium">También revertir consumo de inventario</p>
                <p className="text-[11px] text-muted-foreground">
                  Regresa al stock lo que las ventas borradas habían descontado.
                </p>
              </div>
            </label>
            <div>
              <p className="text-xs mb-1">
                Escribe <span className="font-mono font-bold">LIMPIAR</span> para confirmar:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="LIMPIAR"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowLimpiar(false);
                setConfirmText('');
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== 'LIMPIAR' || limpiando}
              onClick={handleLimpiar}
            >
              {limpiando ? 'Limpiando...' : 'Confirmar limpieza'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TicketViewerDialog venta={verTicket} open={!!verTicket} onClose={() => setVerTicket(null)} />

      <Dialog open={!!selectedVenta} onOpenChange={() => setSelectedVenta(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Detalle: {selectedVenta?.folio}</DialogTitle>
          </DialogHeader>
          {selectedVenta && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-bold">{formatCurrency(selectedVenta.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Costo</p>
                  <p
                    className={`font-bold ${colorize ? 'text-orange-600 dark:text-orange-300' : ''}`}
                  >
                    {formatCurrency(selectedVenta.costo_total_snapshot)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Utilidad</p>
                  <p
                    className={`font-bold ${colorize ? 'text-emerald-600 dark:text-emerald-300' : ''}`}
                  >
                    {formatCurrency(selectedVenta.utilidad_bruta_snapshot)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Margen</p>
                  <p className="font-bold">{formatPercent(selectedVenta.margen_snapshot)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pago</p>
                  <p className="font-bold">{selectedVenta.metodo_pago}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cajero</p>
                  <p className="font-bold">{selectedVenta.usuario_cajero_nombre || '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground">Productos</p>
                <div className="space-y-1">
                  {detalles.map((d, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-sm py-1 border-b last:border-0"
                    >
                      <span>
                        {d.producto_nombre} x{d.cantidad}
                      </span>
                      <span className="font-medium">{formatCurrency(d.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Valoración del comensal (Prompt 6C). Solo lectura. NO se imprime. */}
              {Number(selectedVenta?.satisfaccion_score) > 0 && (
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">
                    Valoración del comensal
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl leading-none">
                      {selectedVenta.satisfaccion_emoji || '⭐'}
                    </span>
                    <div>
                      <p className="font-bold text-sm">
                        {selectedVenta.satisfaccion_label ||
                          `${selectedVenta.satisfaccion_score}/5`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedVenta.satisfaccion_origen === 'portal_qr'
                          ? 'Desde Portal QR'
                          : 'Desde el sistema'}
                      </p>
                    </div>
                  </div>
                  {selectedVenta.satisfaccion_comentario && (
                    <p className="text-sm italic mt-2 leading-snug">
                      “{selectedVenta.satisfaccion_comentario}”
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
