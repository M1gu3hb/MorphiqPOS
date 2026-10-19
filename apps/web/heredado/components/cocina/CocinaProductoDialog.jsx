'use client';
import React from 'react';
import { api } from '@/api/cliente';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChefHat, FileText } from 'lucide-react';

/**
 * Ficha del producto para Cocina — SIN costos, márgenes, gramajes.
 * Muestra: nombre, descripción, ingredientes (solo nombres) y notas/exclusiones del pedido.
 */
export default function CocinaProductoDialog({ open, onClose, item }) {
  // item: { producto_id, producto_nombre, cantidad, notas }
  const productoId = item?.producto_id;

  const { data: producto } = useQuery({
    queryKey: ['cocina_producto_ficha', productoId],
    queryFn: () => api.entidades.ProductoTerminado.get(productoId),
    enabled: !!productoId && open,
  });

  const { data: recetas = [] } = useQuery({
    queryKey: ['cocina_producto_recetas', productoId],
    queryFn: () => api.entidades.RecetaEscandallo.filter({ producto_id: productoId }),
    initialData: [],
    enabled: !!productoId && open,
  });

  const ingredientes = (Array.isArray(recetas) ? recetas : [])
    .filter((r) => r?.activo !== false)
    .map((r) => r?.ingrediente_nombre)
    .filter(Boolean);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose && onClose();
      }}
    >
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-advertencia" />
            {item?.producto_nombre || producto?.nombre || 'Producto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {(item?.cantidad || 0) > 0 && (
            <div className="rounded-xl bg-advertencia/10 border border-advertencia/30 px-3 py-2">
              <p className="text-xs font-bold text-advertencia">
                Cantidad solicitada: {item.cantidad}
              </p>
            </div>
          )}

          {producto?.descripcion && (
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Descripción
              </p>
              <p className="text-sm text-texto">{producto.descripcion}</p>
            </div>
          )}

          {ingredientes.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                Ingredientes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ingredientes.map((nombre, i) => (
                  <span
                    key={`${nombre}-${i}`}
                    className="px-2 py-1 rounded-full text-xs bg-fondo-sutil border text-texto"
                  >
                    {nombre}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Sin ingredientes registrados.</p>
          )}

          {item?.notas && (
            <div className="rounded-xl border-2 border-advertencia/30 bg-advertencia/10 p-3">
              <p className="text-[10px] uppercase font-bold text-advertencia mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Indicaciones del pedido
              </p>
              <p className="text-sm font-medium text-advertencia">{item.notas}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
