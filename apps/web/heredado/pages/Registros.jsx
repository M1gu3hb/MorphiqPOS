'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { api } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/financialUtils';
import PageHeader from '@/components/common/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  FileText,
  Receipt,
  ShoppingBag,
  Package,
  Scissors,
  Printer,
  Trash2,
  Heart,
} from 'lucide-react';
import { toast } from 'sonner';
import CorteViewerDialog from '@/components/cortes/CorteViewerDialog';
import TicketViewerDialog from '@/components/tickets/TicketViewerDialog';
import ResumenPeriodo from '@/components/registros/ResumenPeriodo';
import PeriodoPDF from '@/components/registros/PeriodoPDF';
import LimpiarSeccionButton from '@/components/registros/LimpiarSeccionButton';
import MovimientosPanel from '@/components/registros/MovimientosPanel';
import ExportarSeccionButton from '@/components/registros/ExportarSeccionButton';
import {
  COLUMNS_CORTES,
  COLUMNS_VENTAS,
  COLUMNS_COMPRAS,
  COLUMNS_GASTOS,
  COLUMNS_MOVIMIENTOS,
  COLUMNS_DETALLES_VENTA,
} from '@/lib/exportColumns';
import { exportToCSV } from '@/lib/exportUtils';
import { useConfig } from '@/lib/ConfigContext';
import { printDocument } from '@/lib/print';
import { usePOSAuth } from '@/lib/POSAuthContext';
import PropinasRegistros from '@/components/propinas/PropinasRegistros';
import { tipsEnabled } from '@/utils/tipsUtils';
import { useLocation } from '@/enrutado';

export default function Registros() {
  const { config, paquete_modo } = useConfig();
  const isEsencial = paquete_modo === 'esencial';
  const showOperativos = !isEsencial; // compras, movimientos, gastos
  const showPropinas = tipsEnabled(config);
  const { posUser } = usePOSAuth();
  const isAdmin = posUser?.rol === 'administrador';
  const queryClient = useQueryClient();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [verCorte, setVerCorte] = useState(null);
  const [verVenta, setVerVenta] = useState(null);
  const [pdfData, setPdfData] = useState(null);

  // Tab inicial desde ?tab=propinas (deep link desde Dashboard)
  const initialTab = (() => {
    try {
      const sp = new URLSearchParams(location.search);
      const t = sp.get('tab');
      if (t && ['cortes', 'ventas', 'propinas', 'compras', 'movimientos', 'gastos'].includes(t))
        return t;
    } catch (_) {
      /* noop */
    }
    return 'cortes';
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const t = sp.get('tab');
      if (t && ['cortes', 'ventas', 'propinas', 'compras', 'movimientos', 'gastos'].includes(t)) {
        setActiveTab(t);
      }
    } catch (_) {
      /* noop */
    }
  }, [location.search]);

  const eliminarCorte = async (c) => {
    if (!isAdmin) return;
    if (!confirm(`¿Eliminar corte ${c.folio}? Esta acción no se puede deshacer.`)) return;
    await api.entidades.CorteCaja.delete(c.id);
    queryClient.invalidateQueries({ queryKey: ['registros_cortes'] });
    queryClient.invalidateQueries({ queryKey: ['cortes_historial'] });
    toast.success('Corte eliminado');
  };

  const q = search.trim().toLowerCase();

  // Sin initialData:[] — distinguimos "primer fetch" (loading) de "vacío real".
  // Antes mostraba "Sin registros" mientras cargaba la primera vez.
  // placeholderData mantiene los datos previos durante invalidaciones sin parpadeo.
  const { data: cortesRaw, isPending: cortesLoading } = useQuery({
    queryKey: ['registros_cortes'],
    queryFn: () => api.entidades.CorteCaja.list('-created_date', 200),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const { data: ventasRaw, isPending: ventasLoading } = useQuery({
    queryKey: ['registros_ventas'],
    queryFn: () => api.entidades.Venta.list('-created_date', 1000),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const { data: comprasRaw, isPending: comprasLoading } = useQuery({
    queryKey: ['registros_compras'],
    queryFn: () => api.entidades.CompraInsumo.list('-created_date', 300),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const { data: movimientosRaw, isPending: movimientosLoading } = useQuery({
    queryKey: ['registros_movimientos'],
    queryFn: () => api.entidades.MovimientoInventario.list('-created_date', 500),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const { data: gastosRaw, isPending: gastosLoading } = useQuery({
    queryKey: ['registros_gastos'],
    queryFn: () => api.entidades.GastoOperativo.list('-created_date', 300),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  // Normalización defensiva (nunca undefined a .filter/.map).
  const cortes = Array.isArray(cortesRaw) ? cortesRaw : [];
  const ventas = Array.isArray(ventasRaw) ? ventasRaw : [];
  const compras = Array.isArray(comprasRaw) ? comprasRaw : [];
  const movimientos = Array.isArray(movimientosRaw) ? movimientosRaw : [];
  const gastos = Array.isArray(gastosRaw) ? gastosRaw : [];

  // Flags de "primera carga aún en curso": NO mostrar empty mientras esté true.
  const cortesFirstLoad = cortesLoading && !cortesRaw;
  const ventasFirstLoad = ventasLoading && !ventasRaw;
  const comprasFirstLoad = comprasLoading && !comprasRaw;
  const movimientosFirstLoad = movimientosLoading && !movimientosRaw;
  const gastosFirstLoad = gastosLoading && !gastosRaw;

  // Búsqueda universal por código, folio, producto, fecha, mesa, etc.
  const filterFn = (text) => !q || (text || '').toString().toLowerCase().includes(q);

  const ventasFiltradas = useMemo(
    () =>
      ventas.filter(
        (v) =>
          filterFn(v.folio) ||
          filterFn(v.codigo_caja) ||
          filterFn(v.cliente_nombre) ||
          filterFn(v.usuario_cajero_nombre) ||
          filterFn(v.usuario_mesero_nombre) ||
          filterFn(String(v.mesa_numero)) ||
          filterFn(v.metodo_pago) ||
          filterFn(v.estado) ||
          filterFn(v.fecha_apertura?.slice(0, 10)) ||
          filterFn(v.fecha_cierre?.slice(0, 10)),
      ),
    [ventas, q],
  );

  const cortesFiltrados = useMemo(
    () =>
      cortes.filter(
        (c) =>
          filterFn(c.folio) ||
          filterFn(c.usuario_cajero_nombre) ||
          filterFn(c.estado) ||
          filterFn(c.fecha_cierre?.slice(0, 10)),
      ),
    [cortes, q],
  );

  const comprasFiltradas = useMemo(
    () =>
      compras.filter(
        (c) =>
          filterFn(c.proveedor_nombre) ||
          filterFn(c.factura_folio) ||
          filterFn(c.usuario_nombre) ||
          filterFn(c.metodo_pago) ||
          filterFn(c.fecha),
      ),
    [compras, q],
  );

  const movimientosFiltrados = useMemo(
    () =>
      movimientos.filter(
        (m) =>
          filterFn(m.ingrediente_nombre) ||
          filterFn(m.tipo_movimiento) ||
          filterFn(m.motivo) ||
          filterFn(m.usuario_nombre),
      ),
    [movimientos, q],
  );

  const gastosFiltrados = useMemo(
    () =>
      gastos.filter(
        (g) =>
          filterFn(g.descripcion) ||
          filterFn(g.categoria) ||
          filterFn(g.usuario_nombre) ||
          filterFn(g.fecha),
      ),
    [gastos, q],
  );

  const handlePDF = (data) => {
    setPdfData(data);
    setTimeout(() => {
      printDocument({ mode: 'letter', title: `Reporte-${data.periodo}` });
    }, 250);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registros"
        description="Historial completo de operaciones y reportes administrativos"
      />

      {/* Resumen general con periodos y PDF */}
      <ResumenPeriodo ventas={ventas} compras={compras} gastos={gastos} onPDF={handlePDF} />

      {/* Buscador universal */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código de corte, folio, ticket, producto, fecha, mesa, responsable..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11 bg-white/80 backdrop-blur-sm"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto bg-white/70 backdrop-blur-sm">
          <TabsTrigger value="cortes" className="gap-1">
            <FileText className="w-3 h-3" />
            Cortes ({cortesFiltrados.length})
          </TabsTrigger>
          <TabsTrigger value="ventas" className="gap-1">
            <Receipt className="w-3 h-3" />
            Ventas ({ventasFiltradas.length})
          </TabsTrigger>
          {showPropinas && (
            <TabsTrigger value="propinas" className="gap-1">
              <Heart className="w-3 h-3" />
              Propinas
            </TabsTrigger>
          )}
          {showOperativos && (
            <TabsTrigger value="compras" className="gap-1">
              <ShoppingBag className="w-3 h-3" />
              Compras ({comprasFiltradas.length})
            </TabsTrigger>
          )}
          {showOperativos && (
            <TabsTrigger value="movimientos" className="gap-1">
              <Package className="w-3 h-3" />
              Movimientos ({movimientos.length})
            </TabsTrigger>
          )}
          {showOperativos && (
            <TabsTrigger value="gastos" className="gap-1">
              <Scissors className="w-3 h-3" />
              Gastos ({gastosFiltrados.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* PROPINAS */}
        {showPropinas && (
          <TabsContent value="propinas" className="mt-4">
            <PropinasRegistros />
          </TabsContent>
        )}

        {/* CORTES */}
        <TabsContent value="cortes" className="mt-4 space-y-3">
          <div className="flex justify-end gap-2">
            <ExportarSeccionButton
              rows={(q ? cortesFiltrados : cortes).filter((c) => c.estado === 'cerrado')}
              columns={COLUMNS_CORTES}
              filename="cortes-caja"
            />
            <LimpiarSeccionButton seccion="cortes" />
          </div>
          {cortesFirstLoad ? (
            <LoadingRow label="Cargando cortes…" />
          ) : (
            (() => {
              const fuente = q ? cortesFiltrados : cortes;
              const items = fuente
                .filter((c) => {
                  const tipo = c?.tipo_corte === 'turno' ? 'turno' : 'cierre_diario';
                  return (
                    (tipo === 'cierre_diario' && c?.estado === 'cerrado') ||
                    (tipo === 'turno' && c?.estado === 'registrado')
                  );
                })
                .slice(0, 200);
              if (items.length === 0) return <Empty />;
              return (
                <div className="space-y-2">
                  {items.map((c) => (
                    <CorteRow
                      key={c.id}
                      corte={c}
                      onView={setVerCorte}
                      onDelete={isAdmin ? eliminarCorte : null}
                    />
                  ))}
                </div>
              );
            })()
          )}
        </TabsContent>

        {/* VENTAS */}
        <TabsContent value="ventas" className="mt-4 space-y-3">
          <div className="flex justify-end gap-2 flex-wrap">
            <ExportarSeccionButton
              rows={ventasFiltradas}
              columns={COLUMNS_VENTAS}
              filename="ventas"
            />
            {/* 6B / 1.I — Export granular por producto (líneas de venta).
                Distingue cantidad lógica vs cantidad variable (500 g / 4 shots). */}
            <ExportarDetallesButton ventas={ventasFiltradas} />
            <LimpiarSeccionButton seccion="ventas" />
          </div>
          <div className="space-y-2">
            {ventasFirstLoad ? (
              <LoadingRow label="Cargando ventas…" />
            ) : ventasFiltradas.length === 0 ? (
              <Empty />
            ) : null}
            {!ventasFirstLoad &&
              ventasFiltradas.slice(0, 200).map((v) => (
                <Card
                  key={v.id}
                  className="premium-sheen p-3 flex items-center gap-3 flex-wrap bg-white/70 backdrop-blur-sm"
                >
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono font-bold text-sm">{v.folio}</p>
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
                    <p className="text-xs text-muted-foreground">
                      {v.fecha_apertura
                        ? format(new Date(v.fecha_apertura), 'd MMM yyyy, HH:mm', { locale: es })
                        : ''}
                      {v.mesa_numero ? ` · Mesa ${v.mesa_numero}` : ''}
                      {v.usuario_cajero_nombre ? ` · ${v.usuario_cajero_nombre}` : ''}
                    </p>
                    {v.satisfaccion_comentario && (
                      <p className="text-[11px] italic text-muted-foreground mt-0.5 line-clamp-2">
                        💬 “{v.satisfaccion_comentario}”
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {v.estado}
                  </Badge>
                  <Badge variant="secondary" className="capitalize text-[10px]">
                    {v.metodo_pago || '—'}
                  </Badge>
                  <p className="font-heading font-black min-w-[80px] text-right">
                    {formatCurrency(v.total)}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setVerVenta(v)}>
                    <Printer className="w-3 h-3 mr-1" /> Ver ticket
                  </Button>
                </Card>
              ))}
          </div>
        </TabsContent>

        {/* COMPRAS */}
        <TabsContent value="compras" className="mt-4 space-y-3">
          <div className="flex justify-end gap-2">
            <ExportarSeccionButton
              rows={comprasFiltradas}
              columns={COLUMNS_COMPRAS}
              filename="compras"
            />
            <LimpiarSeccionButton seccion="compras" />
          </div>
          <div className="space-y-2">
            {comprasFirstLoad ? (
              <LoadingRow label="Cargando compras…" />
            ) : comprasFiltradas.length === 0 ? (
              <Empty />
            ) : null}
            {!comprasFirstLoad &&
              comprasFiltradas.map((c) => (
                <Card
                  key={c.id}
                  className="premium-sheen p-3 flex items-center gap-3 flex-wrap bg-white/70 backdrop-blur-sm"
                >
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-semibold text-sm">
                      {c.proveedor_nombre || 'Compra directa'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.fecha} {c.factura_folio ? `· ${c.factura_folio}` : ''}
                      {c.usuario_nombre ? ` · ${c.usuario_nombre}` : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="capitalize text-[10px]">
                    {c.metodo_pago || '—'}
                  </Badge>
                  <p className="font-heading font-black min-w-[80px] text-right">
                    {formatCurrency(c.total_compra)}
                  </p>
                </Card>
              ))}
          </div>
        </TabsContent>

        {/* MOVIMIENTOS — con paginación */}
        <TabsContent value="movimientos" className="mt-4 space-y-3">
          <div className="flex justify-end gap-2">
            <ExportarSeccionButton
              rows={movimientosFiltrados}
              columns={COLUMNS_MOVIMIENTOS}
              filename="movimientos-inventario"
            />
            <LimpiarSeccionButton seccion="movimientos" />
          </div>
          {movimientosFirstLoad ? (
            <LoadingRow label="Cargando movimientos…" />
          ) : (
            <MovimientosPanel movimientos={movimientos} />
          )}
        </TabsContent>

        {/* GASTOS */}
        <TabsContent value="gastos" className="mt-4 space-y-3">
          <div className="flex justify-end gap-2">
            <ExportarSeccionButton
              rows={gastosFiltrados}
              columns={COLUMNS_GASTOS}
              filename="gastos-operativos"
            />
            <LimpiarSeccionButton seccion="gastos" />
          </div>
          <div className="space-y-2">
            {gastosFirstLoad ? (
              <LoadingRow label="Cargando gastos…" />
            ) : gastosFiltrados.length === 0 ? (
              <Empty />
            ) : null}
            {!gastosFirstLoad &&
              gastosFiltrados.map((g) => (
                <Card
                  key={g.id}
                  className="premium-sheen p-3 flex items-center gap-3 flex-wrap bg-white/70 backdrop-blur-sm"
                >
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-semibold text-sm">{g.descripcion}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.fecha} · <span className="capitalize">{g.categoria}</span>
                      {g.usuario_nombre ? ` · ${g.usuario_nombre}` : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="capitalize text-[10px]">
                    {g.metodo_pago || '—'}
                  </Badge>
                  <p
                    className={`font-heading font-black min-w-[80px] text-right ${config?.colorear_importes_monetarios !== false ? 'text-red-600' : 'text-foreground'}`}
                  >
                    −{formatCurrency(g.monto)}
                  </p>
                </Card>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      <CorteViewerDialog corte={verCorte} open={!!verCorte} onClose={() => setVerCorte(null)} />
      <TicketViewerDialog venta={verVenta} open={!!verVenta} onClose={() => setVerVenta(null)} />

      {/* PDF de periodo (solo visible al imprimir) */}
      {pdfData && (
        <div className="fixed inset-0 z-[9999] bg-gray-100 overflow-auto">
          <div className="no-print sticky top-0 bg-white border-b shadow-sm flex justify-between items-center px-4 py-2">
            <p className="text-sm font-medium">Vista previa del reporte</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" />
                Imprimir
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPdfData(null)}>
                Cerrar
              </Button>
            </div>
          </div>
          <div className="py-6 flex justify-center">
            <PeriodoPDF data={pdfData} config={config} isEsencial={isEsencial} />
          </div>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return <p className="text-center text-muted-foreground py-8 text-sm">Sin registros</p>;
}

/** Loader compacto en línea — se muestra mientras la query hace su primer fetch.
 *  Evita el "Sin registros" falso al entrar a Registros con caché vacía. */
function LoadingRow({ label = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      {label}
    </div>
  );
}

/**
 * 6B / 1.I — Exporta el desglose por producto (DetalleVenta) de las ventas
 * actualmente filtradas. Carga bajo demanda (no afecta render inicial).
 *
 * Distingue cantidad lógica (líneas) vs cantidad variable real (g, ml, shots).
 * Para productos precio_fijo, las columnas variables salen vacías (no NaN).
 */
function ExportarDetallesButton({ ventas }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const lista = Array.isArray(ventas) ? ventas : [];
    if (lista.length === 0) {
      toast.warning('No hay ventas para exportar productos.');
      return;
    }
    if (lista.length > 300) {
      const ok = window.confirm(
        `Vas a exportar el desglose por producto de ${lista.length} ventas. Puede tardar unos segundos. ¿Continuar?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      // Cargar detalles de venta para las ventas filtradas, en lotes pequeños
      // para no saturar al backend (cada filter es una request).
      const detalles = [];
      const CHUNK = 5;
      for (let i = 0; i < lista.length; i += CHUNK) {
        const slice = lista.slice(i, i + CHUNK);
        const results = await Promise.all(
          slice.map((v) => api.entidades.DetalleVenta.filter({ venta_id: v.id }).catch(() => [])),
        );
        results.forEach((arr, idx) => {
          const venta = slice[idx];
          (Array.isArray(arr) ? arr : []).forEach((d) => {
            detalles.push({
              ...d,
              venta_id: venta?.folio || d?.venta_id, // mostramos folio en el CSV
            });
          });
        });
      }
      if (detalles.length === 0) {
        toast.warning('No se encontraron productos en las ventas seleccionadas.');
        setBusy(false);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      exportToCSV(detalles, COLUMNS_DETALLES_VENTA, `productos-vendidos-${stamp}`);
      toast.success(`Exportadas ${detalles.length} líneas de venta`);
    } catch (err) {
      console.error('[Registros 1.I] Error export detalles:', err);
      toast.error('No se pudo exportar el desglose por producto.');
    }
    setBusy(false);
  };
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={run} className="gap-1.5">
      <FileText className="w-4 h-4" />
      {busy ? 'Exportando…' : 'Exportar productos'}
    </Button>
  );
}

function CorteRow({ corte, onView, onDelete }) {
  const tipo = corte?.tipo_corte === 'turno' ? 'turno' : 'cierre_diario';
  const esCierreDiario = tipo === 'cierre_diario';
  const tipoLabel = esCierreDiario ? 'Cierre diario' : 'Corte de turno';
  const tipoCls = esCierreDiario
    ? 'bg-red-100 text-red-700 border-red-200'
    : 'bg-amber-100 text-amber-700 border-amber-200';
  return (
    <Card className="p-3 flex items-center gap-3 flex-wrap bg-white/70 backdrop-blur-sm">
      <div className="flex-1 min-w-[180px]">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-heading font-bold text-sm">{corte.folio}</p>
          <span
            className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${tipoCls}`}
          >
            {tipoLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {corte.fecha_cierre
            ? format(new Date(corte.fecha_cierre), 'd MMM yyyy, HH:mm', { locale: es })
            : ''}
          {corte.usuario_cajero_nombre ? ` · ${corte.usuario_cajero_nombre}` : ''}
        </p>
      </div>
      <p className="font-heading font-black min-w-[100px] text-right">
        {formatCurrency(corte.total_general)}
      </p>
      {esCierreDiario ? (
        <Button size="sm" variant="outline" onClick={() => onView(corte)}>
          <FileText className="w-4 h-4 mr-1" /> Ver PDF
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => onView(corte)}>
          Ver detalle
        </Button>
      )}
      {onDelete && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(corte)}
          title="Eliminar este corte"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </Card>
  );
}
