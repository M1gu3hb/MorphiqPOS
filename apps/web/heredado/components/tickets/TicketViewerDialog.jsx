'use client';
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { api } from '@/api/cliente';
import { useConfig } from '@/lib/ConfigContext';
import { printDocument } from '@/lib/print';
import PreCuentaTicket from './PreCuentaTicket';

/**
 * Dialog que muestra el ticket real de una venta y permite reimprimirlo.
 * Usado desde "Ver ticket" en Ventas y Registros.
 */
export default function TicketViewerDialog({ venta, open, onClose }) {
  const { config } = useConfig();
  const [detalles, setDetalles] = useState([]);
  const [mesa, setMesa] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !venta?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Sin `.catch(() => [])`. Esa lista vacía significaba dos cosas a la
        // vez y el diálogo no podía separarlas: «esta venta no tenía
        // productos» y «no pude preguntar». Con la segunda, el ticket se
        // pintaba con su encabezado, su folio y su total pero CERO líneas, y
        // encima ofrecía imprimirlo (F1-06 §4.7). Un documento incompleto que
        // parece completo es peor que no tener documento; si no se puede leer,
        // no se imprime.
        const dets = await api.entidades.DetalleVenta.filter({ venta_id: venta.id });
        // La mesa entra en la MISMA suerte, y no en un `.catch(() => null)`
        // aparte: en el ticket es un renglón impreso, no un adorno. «Sin mesa»
        // es `venta.mesa_id` vacío, que es un hecho; una consulta que falló no
        // lo es.
        const m = venta.mesa_id
          ? (await api.entidades.Mesa.list()).find((x) => x.id === venta.mesa_id) || null
          : null;
        if (cancelled) return;
        setDetalles(dets);
        setMesa(m);
      } catch (e) {
        if (cancelled) return;
        setDetalles([]);
        setMesa(null);
        setError(e?.message || 'No se pudo cargar el ticket.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, venta]);

  const handlePrint = () => {
    printDocument({ mode: 'thermal', title: `Ticket-${venta?.folio || ''}` });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="no-print px-5 pt-4 pb-3 border-b sticky top-0 bg-white z-10 flex-row items-center justify-between">
          <DialogTitle className="font-heading">Ticket · {venta?.folio}</DialogTitle>
          <div className="flex gap-2">
            {/* Si el ticket no se pudo leer entero, no se ofrece imprimirlo. */}
            {!error && (
              <Button size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-1" /> Imprimir
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="p-4 bg-gray-100 flex justify-center">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8">Cargando ticket...</p>
          ) : error ? (
            <p className="text-sm text-muted-foreground py-8">{error}</p>
          ) : (
            <PreCuentaTicket
              venta={venta}
              detalles={detalles}
              mesa={mesa}
              config={config}
              esFinal={venta?.estado === 'pagada'}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
