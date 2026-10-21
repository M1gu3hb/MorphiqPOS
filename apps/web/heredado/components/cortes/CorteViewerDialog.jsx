'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Download, Loader2 } from 'lucide-react';
import { api } from '@/api/cliente';
import { detallesDeVentas } from '@/lib/detallesDeVentas';
import { useConfig } from '@/lib/ConfigContext';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { hasPermission } from '@/lib/permissions';
import { canAccessModule } from '@/lib/packageConfig';
import { getStockStatus } from '@/utils/inventoryUtils';
import { printDocument } from '@/lib/print';
import { downloadNodeAsPDF, safeFileName } from '@/lib/pdfDownload';
import { toast } from 'sonner';
import { format } from 'date-fns';
import CorteTicket from '@/components/tickets/CorteTicket';
import { MARCA_DE_PLATAFORMA } from '~/marca/nombre-visible';

export default function CorteViewerDialog({ corte, open, onClose }) {
  const { config, paquete_modo } = useConfig();
  // El corte enseña costo y utilidad si el negocio los lleva, y el desglose de
  // propinas por mesero si hay sala. Las dos cosas son módulos, no nombres de
  // paquete: con el renombre de D-01 ningún negocio se llama `esencial` ni
  // `restaurante_pro`, y comparar contra esos nombres imprimía el corte
  // equivocado para todos.
  const { posUser } = usePOSAuth();
  const veCostos = hasPermission(posUser?.rol, 'ver_costos');
  // Sin el módulo o sin el permiso de ver costos, la hoja va sin ellos (la cajera abre aquí sus cortes).
  const sinCostos = !canAccessModule('costos_basicos', paquete_modo) || !veCostos;
  const haySala = canAccessModule('mesero', paquete_modo);
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
      // La caja se llama `fecha_apertura` en el puente (`CorteCaja`), no `fecha_inicio`: con el
      // nombre equivocado el inicio era 0 y el corte se quedaba con TODAS las ventas de la
      // historia —666 lecturas al abrir uno, totales que cambiaban cada vez— (21-10-2026).
      const aperturaDelCorte = corte.fecha_apertura || null;
      const inicio = aperturaDelCorte ? new Date(aperturaDelCorte).getTime() : 0;
      const cierre = corte.fecha_cierre ? new Date(corte.fecha_cierre).getTime() : Date.now();
      const corteId = corte.id;

      try {
        // Las cinco lecturas iban con `.catch(() => [])` (F1-06 §4.8). Ninguna es
        // de adorno: sin ventas el corte sale en ceros, sin gastos la utilidad
        // neta sale inflada, sin descuentos el costo sale en cero y el margen al
        // 100 %. Un corte a medias no es un corte: se enseña el error y se deja
        // el diálogo vacío, que es lo que hace que alguien reintente.
        const [allVentas, allGastos, allDescuentos, allIngredientes, allRecetas] =
          await Promise.all([
            api.entidades.Venta.list('-fecha_cierre', 2000),
            api.entidades.GastoOperativo.list('-created_date', 500),
            // Lo de costos e inventario sólo lo lee quien lo puede ver (restaurante, 20-10-2026):
            // para la cajera, que es quien cierra, esas tres lecturas eran 403, el `Promise.all`
            // caía y el corte del día se quedaba SIN PDF. Ahora su hoja sale sin costos —el
            // ticket ya sabe hacerlo (`sinCostos`)— en vez de no salir.
            veCostos ? api.entidades.DescuentoInventarioVenta.list('-created_date', 3000) : [],
            veCostos ? api.entidades.Ingrediente.list() : [],
            veCostos ? api.entidades.RecetaEscandallo.list('-created_date', 2000) : [],
          ]);

        const matchVenta = (v) => {
          // La venta que dice su caja es de ESA caja y de ninguna otra: la ventana de tiempo
          // es sólo para las viejas sin caja, y sin apertura no hay ventana.
          if (v.corte_caja_id) return Boolean(corteId) && v.corte_caja_id === corteId;
          if (!aperturaDelCorte) return false;
          const t = v.fecha_cierre ? new Date(v.fecha_cierre).getTime() : 0;
          if (t >= inicio && t <= cierre) return true;
          const dayCorte = String(aperturaDelCorte).slice(0, 10);
          const dayVenta = (v.fecha_apertura || v.fecha_cierre || '').slice(0, 10);
          return dayCorte === dayVenta;
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
        // Idem venta a venta: con `.catch(() => [])` el desglose por producto
        // salía incompleto y en silencio, ticket a ticket.
        // Una lectura para todos los renglones del corte, no una petición por venta.
        const detalles = await detallesDeVentas(ventasCorte);

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
            ingMap[ingId] = {
              nombre,
              unidad,
              cantidad: 0,
              costoUnit: costoUnit || 0,
              costoTotal: 0,
            };
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
              addIng(
                ing.id,
                ing.nombre,
                ing.unidad_base,
                totalCant,
                ing.costo_por_unidad_base || 0,
              );
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
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        toast.error(err?.message || 'No se pudo cargar el corte. Reintenta antes de imprimirlo.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, corte, veCostos]);

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
        config?.nombre_negocio || config?.platform_brand || MARCA_DE_PLATAFORMA,
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
        <DialogHeader className="no-print px-6 pt-5 pb-3 border-b sticky top-0 bg-superficie z-10 flex-row items-center justify-between">
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
        <div className="p-4 bg-fondo-sutil">
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
              sinCostos={sinCostos}
              haySala={haySala}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
