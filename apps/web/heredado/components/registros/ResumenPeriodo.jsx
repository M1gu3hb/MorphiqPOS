'use client';
import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/utils/financialUtils';
import {
  Calendar,
  FileDown,
  TrendingUp,
  Receipt,
  ShoppingBag,
  Scissors,
  DollarSign,
  Heart,
} from 'lucide-react';
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useConfig } from '@/lib/ConfigContext';

const PERIODOS = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'year', label: 'Este año' },
  { id: 'custom', label: 'Personalizado' },
];

export default function ResumenPeriodo({ ventas = [], compras = [], gastos = [], onPDF }) {
  const { config, paquete_modo } = useConfig();
  const colorize = config?.colorear_importes_monetarios !== false;
  const isEsencial = paquete_modo === 'esencial';
  const [periodo, setPeriodo] = useState('today');
  const [desde, setDesde] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'));

  const range = useMemo(() => {
    const now = new Date();
    if (periodo === 'today') return { from: startOfDay(now), to: endOfDay(now) };
    if (periodo === '7d') return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    if (periodo === '30d') return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    if (periodo === 'mes') return { from: startOfMonth(now), to: endOfMonth(now) };
    if (periodo === 'year') return { from: startOfYear(now), to: endOfDay(now) };
    return { from: startOfDay(new Date(desde)), to: endOfDay(new Date(hasta)) };
  }, [periodo, desde, hasta]);

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    return t >= range.from.getTime() && t <= range.to.getTime();
  };

  const ventasP = ventas.filter(
    (v) => v.estado === 'pagada' && inRange(v.fecha_cierre || v.created_date),
  );
  const comprasP = compras.filter((c) => inRange(c.fecha || c.created_date));
  const gastosP = gastos.filter((g) => inRange(g.fecha || g.created_date));

  const totals = {
    ingresos: ventasP.reduce((s, v) => s + (v.total || 0), 0),
    utilidad: ventasP.reduce((s, v) => s + (v.utilidad_bruta_snapshot || 0), 0),
    nVentas: ventasP.length,
    compras: comprasP.reduce((s, c) => s + (c.total_compra || 0), 0),
    gastos: gastosP.reduce((s, g) => s + (g.monto || 0), 0),
    propinas: ventasP.reduce((s, v) => s + (Number(v?.propina_monto) || 0), 0),
  };
  // Neto NO incluye propinas (no son del restaurante).
  const neto = totals.ingresos - totals.compras - totals.gastos;
  const margen = totals.ingresos > 0 ? (totals.utilidad / totals.ingresos) * 100 : 0;

  return (
    <Card className="p-4 bg-white/70 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-bold">Registros financieros por periodo</h2>
        </div>
        <Button
          size="sm"
          onClick={() =>
            onPDF?.({
              ...range,
              periodo,
              ventas: ventasP,
              compras: comprasP,
              gastos: gastosP,
              totals,
              margen,
              propinas: totals.propinas,
            })
          }
        >
          <FileDown className="w-4 h-4 mr-1" /> Generar PDF
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${periodo === p.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periodo === 'custom' && (
        <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg bg-muted/40">
          <div>
            <Label className="text-[10px] uppercase">Desde</Label>
            <Input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase">Hasta</Label>
            <Input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}

      <div className={`grid grid-cols-2 ${isEsencial ? 'lg:grid-cols-3' : 'lg:grid-cols-5'} gap-3`}>
        <Stat
          icon={DollarSign}
          label="Ingresos"
          value={formatCurrency(totals.ingresos)}
          sub={`${totals.nVentas} ventas`}
          color={colorize ? 'text-primary' : 'text-foreground'}
        />
        <Stat
          icon={Receipt}
          label="Ticket promedio"
          value={formatCurrency(totals.nVentas > 0 ? totals.ingresos / totals.nVentas : 0)}
          color={colorize ? 'text-primary' : 'text-foreground'}
        />
        <Stat
          icon={Heart}
          label="Propinas"
          value={formatCurrency(totals.propinas)}
          sub="Separadas de ventas"
          color={colorize ? 'text-rose-600' : 'text-foreground'}
        />
        {!isEsencial && (
          <>
            <Stat
              icon={TrendingUp}
              label="Utilidad bruta"
              value={formatCurrency(totals.utilidad)}
              sub={`${(Number.isFinite(Number(margen)) ? Number(margen) : 0).toFixed(1)}% margen`}
              color={colorize ? 'text-emerald-600' : 'text-foreground'}
            />
            <Stat
              icon={ShoppingBag}
              label="Compras"
              value={formatCurrency(totals.compras)}
              color={colorize ? 'text-amber-600' : 'text-foreground'}
            />
          </>
        )}
      </div>

      {!isEsencial && (
        <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 flex justify-between items-center">
          <div>
            <p className="text-xs text-muted-foreground">
              Neto del periodo (ingresos − compras − gastos)
            </p>
            <p className="text-[11px] text-muted-foreground">
              {format(range.from, 'd MMM', { locale: es })} –{' '}
              {format(range.to, 'd MMM yyyy', { locale: es })}
            </p>
          </div>
          <p
            className={`font-heading font-black text-2xl ${colorize ? (neto >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-foreground'}`}
          >
            {neto >= 0 ? '' : '−'}
            {formatCurrency(Math.abs(neto))}
          </p>
        </div>
      )}
      {isEsencial && (
        <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 flex justify-between items-center">
          <div>
            <p className="text-xs text-muted-foreground">Total cobrado en el periodo</p>
            <p className="text-[11px] text-muted-foreground">
              {format(range.from, 'd MMM', { locale: es })} –{' '}
              {format(range.to, 'd MMM yyyy', { locale: es })}
            </p>
          </div>
          <p
            className={`font-heading font-black text-2xl ${colorize ? 'text-primary' : 'text-foreground'}`}
          >
            {formatCurrency(totals.ingresos)}
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="p-3 rounded-xl border bg-white/80">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className={`font-heading font-bold text-lg ${color || ''}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
