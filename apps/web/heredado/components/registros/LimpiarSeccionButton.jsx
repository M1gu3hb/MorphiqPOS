'use client';
import React, { useState } from 'react';
import { api } from '@/api/cliente';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useQueryClient } from '@tanstack/react-query';

const LABELS = {
  cortes: 'cortes',
  ventas: 'ventas',
  compras: 'compras',
  gastos: 'gastos',
  movimientos: 'movimientos de inventario',
};

const NOTAS = {
  cortes: 'Eliminará todos los cortes de caja históricos.',
  ventas:
    'Eliminará ventas, sus detalles, descuentos de inventario y pedidos de cocina relacionados.',
  compras: 'Eliminará compras y sus detalles. Los stocks NO se revierten automáticamente.',
  gastos: 'Eliminará gastos operativos.',
  movimientos: 'Eliminará el historial de movimientos. Los stocks actuales NO se modifican.',
};

/**
 * Botón rojo solo para admin. Pide confirmación con texto "ELIMINAR".
 */
export default function LimpiarSeccionButton({ seccion, onCleared }) {
  const { posUser } = usePOSAuth();
  const queryClient = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);
  const [open, setOpen] = useState(false);

  if (posUser?.rol !== 'administrador') return null;

  const handle = async () => {
    // Antes se comparaba contra la palabra «ELIMINAR», impresa en esta misma
    // pantalla. Ahora se manda el nombre del negocio y lo compara el SERVIDOR
    // contra el que lee de la base, en la misma transacción que va a borrar.
    // La comprobación del cliente se queda como ergonomía, no como seguridad:
    // evita un viaje de red cuando el campo está vacío.
    if (confirmText.trim() === '') {
      toast.error('Escribe el nombre del negocio para confirmar');
      return;
    }
    setWorking(true);
    try {
      // `res` YA es `datos`: `pedir()` desenvuelve el sobre. Leer `res.data.ok`
      // —como hacía este código— daba «error» DESPUÉS de un borrado correcto, y
      // alguien lo intentaría dos veces.
      const res = await api.comandos.ejecutar('/api/mantenimiento/purgar-seccion', {
        seccion,
        confirmacionNombreNegocio: confirmText.trim(),
      });
      const total = Object.values(res?.borrado || {}).reduce((s, n) => s + (Number(n) || 0), 0);
      toast.success(`Se eliminaron ${total} registros de ${LABELS[seccion]}`);
      // Invalida caches relevantes
      [
        'registros_cortes',
        'registros_ventas',
        'registros_compras',
        'registros_movimientos',
        'registros_gastos',
        'cortes',
        'ventas_pendientes_caja',
        'ventas_pagadas_caja',
        'ventas_corte',
        'gastos_hoy',
        'compras_all',
        'movimientos_inv',
      ].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onCleared?.();
      setConfirmText('');
      setOpen(false);
    } catch (e) {
      toast.error('Error: ' + (e?.message || ''));
    }
    setWorking(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" className="gap-1">
          <Trash2 className="w-3.5 h-3.5" /> Limpiar {LABELS[seccion]}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            ¿Limpiar historial de {LABELS[seccion]}?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{NOTAS[seccion]}</span>
            <span className="block font-medium text-destructive">
              Esta acción NO afecta datos maestros (productos, recetas, ingredientes,
              configuración).
            </span>
            <span className="block font-medium text-destructive">
              Esto no se puede deshacer. El único rescate es un punto de restauración de la
              base de datos.
            </span>
            <span className="block">
              Para confirmar escribe el <strong>nombre de tu negocio</strong>:
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Nombre del negocio"
          className="font-mono"
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText('')}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handle();
            }}
            className="bg-destructive hover:bg-destructive/90"
            disabled={working}
          >
            {working ? 'Eliminando...' : 'Eliminar historial'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
