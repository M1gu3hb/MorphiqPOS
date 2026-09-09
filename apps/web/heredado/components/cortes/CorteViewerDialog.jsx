'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Download, Loader2 } from 'lucide-react';
import { api } from '@/api/cliente';
import { useConfig } from '@/lib/ConfigContext';
import { getStockStatus } from '@/utils/inventoryUtils';
import { printDocument } from '@/lib/print';
import { downloadNodeAsPDF, safeFileName } from '@/lib/pdfDownload';
import { toast } from 'sonner';
import { format } from 'date-fns';
import CorteTicket from '@/components/tickets/CorteTicket';

export default function CorteViewerDialog({ corte, open, onClose }) {
  const { config, paquete_modo } = useConfig();
  const isEsencial = paquete_modo === 'esencial';
  const isRP = paquete_modo === 'restaurante_pro';
  const ticketRef = useRef(null);
  const [data, setData] = useState({
    ventas: [],
    detalles: [],
    gastos: [],
    ingredientes: [],
    cancelaciones: [],
    alertas: [],
  });
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !corte) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const inicio = corte.fecha_inicio ? new Date(corte.fecha_inicio).getTime() : 0;
      const cierre = corte.fecha_cierre ? new Date(corte.fecha_cierre).getTime() : Date.now();
      const corteId = corte.id;

      const [allVentas, allGastos, allDescuentos, allIngredientes, allRecetas] = await Promise.all([
        api.entidades.Venta.list('-fecha_cierre', 2000).catch(() => []),
        api.entidades.GastoOperativo.list('-created_date', 500).catch(() => []),
        api.entidades.DescuentoInventarioVenta.list('-created_date', 3000).catch(() => []),
        api.entidades.Ingrediente.list().catch(() => []),
        api.entidades.RecetaEscandallo.list('-created_date', 2000).catch(() => []),
      ]);

      const matchVenta = (v) => {
        if (corteId && v.corte_caja_id === corteId) return true;
        const t = v.fecha_cierre ? new Date(v.fecha_cierre).getTime() : 0;
        if (t >= inicio && t <= cierre) return true;
        if (!v.corte_caja_id && corte.fecha_inicio) {
          const dayCorte = corte.fecha_inicio.slice(0, 10);
          const dayVenta = (v.fecha_apertura || v.fecha_cierre || '').slice(0, 10);
          if (dayCorte && dayCorte === dayVenta) return true;
        }
        return false;
      };

      const ventasCorte = allVentas.filter((v) => v.estado === 'pagada' && matchVenta(v));
      const cancelaciones = allVentas.filter((v) => {
        if (v.estado !== 'cancelada') return false;
        const t = v.fecha_cierre
          ? new Date(v.fecha_cierre).getTime()
          : v.fecha_apertura
            ? new Date(v.fecha_apertura).getTime()
            : 0;
        return (corteId && v.corte_caja_id === corteId) || (t >= inicio && t <= cierre);
      });

      const ventaIds = ventasCorte.map((v) => v.id);
      const detalles = ventaIds.length
        ? (
            await Promise.all(
              ventaIds.map((id) =>
                api.entidades.DetalleVenta.filter({ venta_id: id }).catch(() => []),
              ),
            )
          ).flat()
        : [];

      const gastosCorte = allGastos.filter((g) => {
        const t = g.created_date ? new Date(g.created_date).getTime() : 0;
        return t >= inicio && t <= cierre;
      });

      const descuentosCorte = allDescuentos.filter((d) => ventaIds.includes(d.venta_id));
      const ingMap = {};
      const ingPorId = Object.fromEntries(allIngredientes.map((i) => [i.id, i]));

      const addIng = (ingId, nombre, unidad, qty, costoUnit) => {
        if (!ingId || !qty) return;
        if (!ingMap[ingId])
          ingMap[ingId] = { nombre, unidad, cantidad: 0, costoUnit: costoUnit || 0, costoTotal: 0 };
        ingMap[ingId].cantidad += qty;
        ingMap[ingId].costoTotal += qty * (costoUnit || 0);
      };

      if (descuentosCorte.length > 0) {
        descuentosCorte.forEach((d) => {
          addIng(
            d.ingrediente_id,
            d.ingrediente_nombre,
            d.unidad_base,
            d.cantidad_total_descontada || 0,
            d.costo_unitario_snapshot || 0,
          );
        });
      } else {
        detalles.forEach((det) => {
          const recetaLines = allRecetas.filter(
            (r) => r.producto_id === det.producto_id && r.activo !== false,
          );
          recetaLines.forEach((l) => {
            const ing = ingPorId[l.ingrediente_id];
            if (!ing) return;
            const merma = 1 + (l.merma_porcentaje || 0) / 100;
            const cantPorProd = (l.cantidad_convertida_unidad_base || 0) * merma;
            const totalCant = cantPorProd * (det.cantidad || 0);
            addIng(ing.id, ing.nombre, ing.unidad_base, totalCant, ing.costo_por_unidad_base || 0);
          });
        });
      }

      const ingredientesConsumidos = Object.values(ingMap).sort(
        (a, b) => b.costoTotal - a.costoTotal,
      );
      const alertas = allIngredientes
        .map((i) => ({ ...i, status: getStockStatus(i) }))
        .filter((i) => ['critico', 'agotado', 'bajo'].includes(i.status));

      if (!cancelled) {
        setData({
          ventas: ventasCorte,
          detalles,
          gastos: gastosCorte,
          ingredientes: ingredientesConsumidos,
          cancelaciones,
          alertas,
        });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, corte]);

  // === Imprimir (sí abre diálogo del navegador) ===
  const handlePrintCashCut = () => {
    printDocument({ mode: 'letter', title: `Corte-${corte?.folio || ''}` });
  };

  // === Descargar PDF (NO abre imprimir) ===
  const handleDownloadCashCutPDF = async () => {
    if (!ticketRef.current) {
      toast.error('No se encontró el contenido para generar el PDF');
      return;
    }
    setDownloading(true);
    try {
      const fecha = corte?.fecha_cierre
        ? format(new Date(corte.fecha_cierre), 'yyyyMMdd')
        : format(new Date(), 'yyyyMMdd');
      const negocio = safeFileName(
        config?.nombre_negocio || config?.platform_brand || 'MH-Astral-Systems',
      );
      const folio = safeFileName(corte?.folio || 'corte');
      const filename = `Corte_${folio}_${fecha}_${negocio}.pdf`;
      await downloadNodeAsPDF(ticketRef.current, filename);
      toast.success('PDF descargado');
    } catch (err) {
      console.error('Error generando PDF:', err);
      toast.error('No se pudo generar el PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="no-print px-6 pt-5 pb-3 border-b sticky top-0 bg-white z-10 flex-row items-center justify-between">
          <DialogTitle className="font-heading">PDF de corte · {corte?.folio}</DialogTitle>
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePrintCashCut} disabled={loading}>
              <Printer className="w-4 h-4 mr-1" /> Imprimir / PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadCashCutPDF}
              disabled={loading || downloading}
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              Descargar
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="p-4 bg-gray-100">
          {loading ? (
            <p className="text-center py-12 text-muted-foreground">Cargando datos del corte...</p>
          ) : (
            <CorteTicket
              ref={ticketRef}
              corte={corte}
              ventas={data.ventas}
              detalles={data.detalles}
              gastos={data.gastos}
              ingredientes={data.ingredientes}
              cancelaciones={data.cancelaciones}
              alertas={data.alertas}
              config={config}
              isEsencial={isEsencial}
              isRP={isRP}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
