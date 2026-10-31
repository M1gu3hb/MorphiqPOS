'use client';
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { buildPortalQRUrl } from '@/utils/qrUtils';
import { MiniaturaDelQr } from '~/restaurante/qr-de-mesas/MiniaturaDelQr';
import { DescargasDeLaMesa } from '~/restaurante/qr-de-mesas/DescargasDeLaMesa';

/**
 * Modal que muestra el QR de una mesa con acciones: copiar / abrir / descargar.
 *
 * DP-9.8: el QR se ve con su diseño, y PNG, SVG y PDF salen a su tamaño en milímetros sólo si
 * se leen (cada descarga lo revisa antes).
 */
export default function QRMesaDialog({ mesa, open, onClose, diseno, logo }) {
  const url = mesa ? buildPortalQRUrl(mesa) : '';
  const numero = Number(mesa?.numero) || 0;

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const abrir = () => {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose && onClose();
      }}
    >
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading">
            QR Mesa {mesa?.numero}
            {mesa?.nombre ? ` · ${mesa.nombre}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="bg-superficie border-2 border-borde rounded-xl p-3 shadow-sm">
            {url && diseno ? (
              <MiniaturaDelQr
                contenido={url}
                numero={numero}
                diseno={diseno}
                logo={logo ?? null}
                tamano="grande"
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground break-all text-center max-w-full px-2">
            {url}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copiar} className="gap-2">
            <Copy className="w-4 h-4" /> Copiar
          </Button>
          <Button variant="outline" onClick={abrir} className="gap-2">
            <ExternalLink className="w-4 h-4" /> Abrir
          </Button>
          {url && diseno ? (
            <DescargasDeLaMesa mesa={{ numero, contenido: url, diseno }} logo={logo ?? null} />
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
