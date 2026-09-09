'use client';
import React, { useMemo } from 'react';
import { api } from '@/api/cliente';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '@/lib/ConfigContext';
import { useIsDark } from '@/lib/ThemeContext';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { getStockStatus } from '@/utils/inventoryUtils';
import PageHeader from '@/components/common/PageHeader';
import { StockStatusBadge } from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/enrutado';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  ShoppingCart,
  Package,
  AlertTriangle,
  CreditCard,
  Banknote,
  ArrowRight,
  Wallet,
  Smartphone,
  Scissors,
  FileText,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import CorteHistorialList from '@/components/cortes/CorteHistorialList';
import ColoredStatCard, { PAYMENT_COLORS } from '@/components/dashboard/ColoredStatCard';
import FinancialChart from '@/components/dashboard/FinancialChart';
import { useCajaAbierta } from '@/lib/useCajaAbierta';
import PropinasDashboardSection from '@/components/propinas/PropinasDashboardSection';
import { tipsEnabled } from '@/utils/tipsUtils';
import LoadingState from '@/components/common/LoadingState';
import PrimerosPasosCard from '@/components/dashboard/PrimerosPasosCard';

const isCajaDirecta = (modo) => modo === 'esencial' || modo === 'operativo';

export default function Dashboard() {
  const { config, paquete_modo } = useConfig();
  const isEsencial = paquete_modo === 'esencial';
  const showCostos = !isEsencial;
  const showInventario = !isEsencial;
  const showFinancialChart = paquete_modo === 'restaurante_pro';
  const showCompras = !isEsencial;
  const { cajaAbierta, hayCaja, isLoading: cajaLoading } = useCajaAbierta();
  // Nota: la neutralización del color del MONTO la hace cada card internamente
  // (ColoredStatCard / PaymentCard leen `colorear_importes_monetarios` y solo
  // cambian el color del número, conservando fondo/borde/icono).

  // No usar initialData:[] — queremos distinguir "primer fetch" de "vacío real"
  // para no mostrar ceros falsos mientras carga la primera vez.
  const { data: ventas, isPending: ventasLoading } = useQuery({
    queryKey: ['ventas_hoy'],
    queryFn: () => api.entidades.Venta.filter({ estado: 'pagada' }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const { data: ingredientes } = useQuery({
    queryKey: ['ingredientes_all'],
    queryFn: () => api.entidades.Ingrediente.filter({ activo: true }),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });
  const { data: gastos, isPending: gastosLoading } = useQuery({
    queryKey: ['gastos_hoy'],
    queryFn: () => api.entidades.GastoOperativo.list(),
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  // Datos ligeros SOLO para la card de "Primeros pasos" en Dashboard.
  // IMPORTANTE: query keys UNICAS (prefijo `onboarding_`) para no contaminar
  // el caché que usan Productos, Mesero, Portal QR, Inventario, Configuración.
  // Cada módulo sigue usando sus propias keys originales.
  // IMPORTANTE: NO usar initialData:[] aquí — necesitamos saber cuándo
  // terminó realmente el primer fetch para no mostrar "Primeros pasos"
  // con datos vacíos falsos (eso causa el flash).
  const { data: usuarios, isFetched: usuariosFetched } = useQuery({
    queryKey: ['onboarding_usuarios'],
    queryFn: () => api.entidades.UsuarioPOS.filter({ activo: true }),
  });
  const { data: mesasAll, isFetched: mesasFetched } = useQuery({
    queryKey: ['onboarding_mesas'],
    queryFn: () => api.entidades.Mesa.list('-created_date', 500),
  });
  const { data: categoriasProd, isFetched: categoriasFetched } = useQuery({
    queryKey: ['onboarding_categorias'],
    queryFn: () => api.entidades.CategoriaProducto.filter({ activo: true }),
  });
  const { data: productosAll, isFetched: productosFetched } = useQuery({
    queryKey: ['onboarding_productos'],
    queryFn: () => api.entidades.ProductoTerminado.filter({ activo: true }),
  });
  const { data: cortesAll, isFetched: cortesFetched } = useQuery({
    queryKey: ['onboarding_cortes'],
    queryFn: () => api.entidades.CorteCaja.list('-created_date', 5),
  });
  // El onboarding solo está "listo" cuando TODOS los queries terminaron su
  // primer fetch. Hasta ese momento, la card no se renderiza.
  const onboardingReady =
    !!config &&
    !cajaLoading &&
    usuariosFetched &&
    mesasFetched &&
    categoriasFetched &&
    productosFetched &&
    cortesFetched;

  const safeIngredientes = Array.isArray(ingredientes) ? ingredientes : [];
  // Sincronización de carga: dashboard "cargando" si caja, ventas o gastos
  // aún no han hecho su primer fetch. Evita ceros y "caja cerrada" falsos.
  const dashboardCargando = cajaLoading || (ventasLoading && !ventas) || (gastosLoading && !gastos);

  // KPIs operativos basados en la caja abierta actual.
  const stats = useMemo(() => {
    const safeVentas = Array.isArray(ventas) ? ventas : [];
    const safeGastos = Array.isArray(gastos) ? gastos : [];
    if (!cajaAbierta) {
      return {
        totalVentas: 0,
        totalCosto: 0,
        utilidadBruta: 0,
        margen: 0,
        totalEfectivo: 0,
        totalTarjeta: 0,
        totalTransferencia: 0,
        totalGastos: 0,
        ticketPromedio: 0,
        numTickets: 0,
        utilidadNeta: 0,
      };
    }
    const aperturaIso =
      cajaAbierta.fecha_apertura || cajaAbierta.fecha_inicio || cajaAbierta.created_date;
    const apertura = aperturaIso ? new Date(aperturaIso).getTime() : 0;
    const ventasCaja = safeVentas.filter((v) => {
      if (!v) return false;
      if (v.corte_caja_id && v.corte_caja_id === cajaAbierta.id) return true;
      if (!v.corte_caja_id && v.fecha_cierre) {
        const t = new Date(v.fecha_cierre).getTime();
        return Number.isFinite(t) && t >= apertura;
      }
      return false;
    });
    const gastosCaja = safeGastos.filter((g) => {
      if (!g) return false;
      const tCreated = g.created_date ? new Date(g.created_date).getTime() : 0;
      return tCreated >= apertura;
    });

    const totalVentas = ventasCaja.reduce((s, v) => s + (v.total || 0), 0);
    const totalCosto = ventasCaja.reduce((s, v) => s + (v.costo_total_snapshot || 0), 0);
    const utilidadBruta = totalVentas - totalCosto;
    const margen = totalVentas > 0 ? (utilidadBruta / totalVentas) * 100 : 0;
    const totalEfectivo = ventasCaja.reduce((s, v) => s + (v.monto_efectivo || 0), 0);
    const totalTarjeta = ventasCaja.reduce((s, v) => s + (v.monto_tarjeta || 0), 0);
    const totalTransferencia = ventasCaja.reduce((s, v) => s + (v.monto_transferencia || 0), 0);
    const totalGastos = gastosCaja.reduce((s, g) => s + (g.monto || 0), 0);
    const ticketPromedio = ventasCaja.length > 0 ? totalVentas / ventasCaja.length : 0;

    return {
      totalVentas,
      totalCosto,
      utilidadBruta,
      margen,
      totalEfectivo,
      totalTarjeta,
      totalTransferencia,
      totalGastos,
      ticketPromedio,
      numTickets: ventasCaja.length,
      utilidadNeta: utilidadBruta - totalGastos,
    };
  }, [ventas, gastos, cajaAbierta]);

  const alertIngredients = useMemo(() => {
    return safeIngredientes
      .map((i) => ({ ...i, stockStatus: getStockStatus(i) }))
      .filter((i) => ['critico', 'agotado', 'bajo'].includes(i.stockStatus))
      .sort((a, b) => {
        const order = { agotado: 0, critico: 1, bajo: 2 };
        return (order[a.stockStatus] || 3) - (order[b.stockStatus] || 3);
      });
  }, [safeIngredientes]);

  const paymentData = [
    { name: 'Efectivo', value: stats.totalEfectivo, fill: PAYMENT_COLORS.efectivo },
    { name: 'Tarjeta', value: stats.totalTarjeta, fill: PAYMENT_COLORS.tarjeta },
    { name: 'Transferencia', value: stats.totalTransferencia, fill: PAYMENT_COLORS.transferencia },
  ].filter((d) => d.value > 0);

  // Progreso de onboarding — flags simples basados en lo que YA existe en BD.
  // Es solo informativo. No bloquea nada.
  const progresoOnboarding = useMemo(() => {
    // Negocio "configurado" = no es ninguno de los nombres por defecto y no está vacío.
    const nombreNeg = String(config?.nombre_negocio || '').trim();
    const esDefault =
      nombreNeg === 'MH Astral Systems' || nombreNeg === 'Mi negocio' || nombreNeg === '';
    const negocioOk = !esDefault;
    const usuariosOk = (Array.isArray(usuarios) ? usuarios : []).length > 0;
    const mesasOk =
      config?.usa_mesas === false ? true : (Array.isArray(mesasAll) ? mesasAll : []).length > 0;
    const categoriasOk = (Array.isArray(categoriasProd) ? categoriasProd : []).length > 0;
    const unidadesOk = !!(
      config?.unidades_medida_lista && String(config.unidades_medida_lista).trim().length > 0
    );
    const inventarioOk = safeIngredientes.length > 0;
    const recetasOk = (Array.isArray(productosAll) ? productosAll : []).length > 0;
    const cajaOk = hayCaja || (Array.isArray(cortesAll) ? cortesAll : []).length > 0;
    return {
      negocio: negocioOk,
      usuarios: usuariosOk,
      mesas: mesasOk,
      categorias: categoriasOk,
      unidades: unidadesOk,
      inventario: inventarioOk,
      recetas: recetasOk,
      caja: cajaOk,
    };
  }, [
    config,
    usuarios,
    mesasAll,
    categoriasProd,
    safeIngredientes,
    productosAll,
    hayCaja,
    cortesAll,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Buen día"
        description={`${config.nombre_negocio} · ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            {paquete_modo === 'restaurante_pro' && (
              <Link to="/pos">
                <Button size="sm">
                  <ShoppingCart className="w-4 h-4 mr-1" /> Nueva venta
                </Button>
              </Link>
            )}
            {isCajaDirecta(paquete_modo) && (
              <Link to="/caja">
                <Button size="sm">
                  <ShoppingCart className="w-4 h-4 mr-1" /> Ir a Caja
                </Button>
              </Link>
            )}
            {showCompras && (
              <Link to="/compras">
                <Button size="sm" variant="outline">
                  Registrar compra
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Card informativa de Primeros pasos — solo aparece si quedan pasos
          pendientes, el admin no la ha ocultado y los queries terminaron su
          primer fetch (ready). Sin `ready` la card no se renderiza nunca,
          evitando el flash "pendiente → completado" al cargar Dashboard. */}
      <PrimerosPasosCard progreso={progresoOnboarding} ready={onboardingReady} />

      {/* Mientras carga la caja real, NO afirmamos "no hay caja abierta".
          Esto evita el bug donde el dashboard decía "cerrada" antes del primer fetch. */}
      {cajaLoading ? (
        <div className="px-4 py-3 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-muted-foreground/40 border-t-primary rounded-full animate-spin" />
          <p className="flex-1">Verificando caja abierta…</p>
        </div>
      ) : !hayCaja ? (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="flex-1">
            <span className="font-semibold">No hay caja abierta.</span> Abre caja para comenzar
            operación. Los indicadores operativos están en cero hasta que se abra una caja.
          </p>
          <Link to="/caja">
            <Button size="sm" variant="outline">
              Ir a Caja
            </Button>
          </Link>
        </div>
      ) : null}

      {/* Si el dashboard está cargando ventas/gastos por primera vez, mostramos
          aviso de sincronización en lugar de KPIs en cero. */}
      {hayCaja && dashboardCargando && (
        <LoadingState label="Sincronizando datos del dashboard…" compact />
      )}

      {/* Main stats — colored, skeuomorphic.
          Las cards SIEMPRE conservan su identidad visual (fondo/borde/icono).
          Solo el color del MONTO se neutraliza si colorear_importes_monetarios=false
          (eso lo decide ColoredStatCard internamente). */}
      {!dashboardCargando && (
        <div
          className={`grid grid-cols-2 ${showCostos ? 'lg:grid-cols-4' : 'lg:grid-cols-2'} gap-3`}
        >
          <ColoredStatCard
            title="Ventas hoy"
            value={formatCurrency(stats.totalVentas)}
            icon={DollarSign}
            subtitle={`${stats.numTickets} tickets`}
            color="primary"
            accent
          />
          {showCostos && (
            <ColoredStatCard
              title="Costo de ventas"
              value={formatCurrency(stats.totalCosto)}
              icon={Receipt}
              color="amber"
            />
          )}
          {showCostos && (
            <ColoredStatCard
              title="Utilidad bruta"
              value={formatCurrency(stats.utilidadBruta)}
              icon={TrendingUp}
              subtitle={formatPercent(stats.margen) + ' margen'}
              color="cyan"
            />
          )}
          <ColoredStatCard
            title="Ticket promedio"
            value={formatCurrency(stats.ticketPromedio)}
            icon={CreditCard}
            color="slate"
          />
        </div>
      )}

      {/* Payment methods row + Gastos + Utilidad neta. Oculto durante primer fetch. */}
      {!dashboardCargando && (
        <div
          className={`grid grid-cols-2 ${showCostos ? 'lg:grid-cols-5' : 'lg:grid-cols-3'} gap-3`}
        >
          <PaymentCard
            label="Efectivo"
            value={stats.totalEfectivo}
            color={PAYMENT_COLORS.efectivo}
            icon={Banknote}
          />
          <PaymentCard
            label="Tarjeta"
            value={stats.totalTarjeta}
            color={PAYMENT_COLORS.tarjeta}
            icon={CreditCard}
          />
          <PaymentCard
            label="Transferencia"
            value={stats.totalTransferencia}
            color={PAYMENT_COLORS.transferencia}
            icon={Smartphone}
          />
          {showCostos && (
            <ColoredStatCard
              title="Gastos operativos"
              value={formatCurrency(stats.totalGastos)}
              icon={Scissors}
              color="rose"
            />
          )}
          {showCostos && (
            <ColoredStatCard
              title="Utilidad neta est."
              value={formatCurrency(stats.utilidadNeta)}
              icon={Wallet}
              color={stats.utilidadNeta >= 0 ? 'green' : 'rose'}
              accent
            />
          )}
        </div>
      )}

      {/* Inventario crítico (compacto en su propia card) */}
      {showInventario && alertIngredients.length > 0 && (
        <ColoredStatCard
          title="Inventario crítico"
          value={`${alertIngredients.length} ingredientes`}
          icon={AlertTriangle}
          color="rose"
          subtitle="Requieren atención"
        />
      )}

      {/* Análisis financiero — gráfica con filtros de período (solo Restaurante Pro) */}
      {showFinancialChart && <FinancialChart ventas={ventas} gastos={gastos} />}

      {/* Propinas — solo si están activadas y existen propinas registradas */}
      {tipsEnabled(config) && <PropinasDashboardSection />}

      {/* Charts row */}
      <ChartsRow
        showInventario={showInventario}
        paymentData={paymentData}
        alertIngredients={alertIngredients}
      />

      {/* Cortes de caja — Dashboard muestra solo los 7 más recientes.
          El historial completo sigue disponible en Registros > Cortes. */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Cortes de caja recientes
          </CardTitle>
          <Link to="/registros?tab=cortes">
            <Button variant="ghost" size="sm" className="text-xs">
              Ver historial <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          <CorteHistorialList limit={7} maxVisible={7} compact showFilter={false} />
          <p className="text-[11px] text-muted-foreground text-center">
            Mostrando los últimos 7 cortes. Consulta el historial completo en Registros.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Fila de charts con dark-mode awareness y reflejo premium en cards. */
function ChartsRow({ showInventario, paymentData, alertIngredients }) {
  const isDark = useIsDark();
  const cardBg = isDark
    ? 'linear-gradient(135deg, hsl(222 40% 11%) 0%, hsl(222 40% 9%) 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #fafaf7 100%)';
  const cardShadow = isDark
    ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 20px rgba(0,0,0,0.35)'
    : '0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 20px rgba(0,0,0,0.06)';
  return (
    <div className={`grid ${showInventario ? 'lg:grid-cols-2' : 'lg:grid-cols-1'} gap-5`}>
      <Card
        className="premium-sheen border-2 text-card-foreground"
        style={{ background: cardBg, boxShadow: cardShadow }}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading">Métodos de pago — hoy</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentDonut paymentData={paymentData} />
        </CardContent>
      </Card>

      {showInventario && (
        <Card
          className="premium-sheen border-2 text-card-foreground"
          style={{ background: cardBg, boxShadow: cardShadow }}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" /> Alertas de inventario
            </CardTitle>
            <Link to="/inventario">
              <Button variant="ghost" size="sm" className="text-xs">
                Ver todo <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {alertIngredients.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {alertIngredients.map((ing) => (
                  <div
                    key={ing.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{ing.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {ing.stock_actual} {ing.unidad_base}
                      </p>
                    </div>
                    <StockStatusBadge status={ing.stockStatus} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Package className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Inventario en buen estado</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PaymentDonut({ paymentData }) {
  const isDark = useIsDark();
  if (paymentData.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Sin ventas hoy</p>;
  }
  return (
    <div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={paymentData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
              nameKey="name"
              stroke={isDark ? '#0f172a' : '#ffffff'}
              strokeWidth={2}
            >
              {paymentData.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val) => formatCurrency(val)}
              contentStyle={
                isDark
                  ? {
                      backgroundColor: '#0f172a',
                      color: '#f1f5f9',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      fontSize: 12,
                    }
                  : { fontSize: 12 }
              }
              labelStyle={isDark ? { color: '#f1f5f9' } : undefined}
              itemStyle={isDark ? { color: '#f1f5f9' } : undefined}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center flex-wrap gap-3 -mt-2">
        {paymentData.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-full" style={{ background: d.fill }} />
            <span className="font-medium">{d.name}:</span> {formatCurrency(d.value)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card de método de pago: usa el mismo color que la gráfica de pastel.
 *  Dark-aware: degradado más sólido y visible sobre fondo oscuro. */
function PaymentCard({ label, value, color, icon: Icon }) {
  const { config } = useConfig();
  const isDark = useIsDark();
  const colorize = config?.colorear_importes_monetarios !== false;
  const valueColor = colorize ? color : isDark ? '#f1f5f9' : '#0f172a';
  const bg = isDark
    ? `linear-gradient(135deg, #14202e 0%, ${color}33 100%)`
    : `linear-gradient(135deg, #ffffff 0%, ${color}12 100%)`;
  const sheen = isDark
    ? `0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 18px ${color}40`
    : `0 1px 0 rgba(255,255,255,0.7) inset, 0 8px 18px ${color}20`;
  return (
    <div
      className="premium-sheen rounded-2xl p-4 border-2 relative overflow-hidden"
      style={{
        background: bg,
        borderColor: isDark ? color + '80' : color + '40',
        boxShadow: sheen,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color }}>
            {label}
          </p>
          <p
            className="text-xl font-heading font-black mt-1 truncate"
            style={{ color: valueColor }}
          >
            {formatCurrency(value)}
          </p>
        </div>
        {Icon && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: isDark ? color + '40' : color + '20',
              boxShadow: isDark
                ? `0 2px 4px ${color}40, 0 1px 0 rgba(255,255,255,0.08) inset`
                : `0 2px 4px ${color}30, 0 1px 0 rgba(255,255,255,0.5) inset`,
            }}
          >
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        )}
      </div>
    </div>
  );
}
