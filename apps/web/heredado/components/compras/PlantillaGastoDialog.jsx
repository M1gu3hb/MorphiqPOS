'use client';
import React, { useState, useEffect } from 'react';
import { api } from '@/api/cliente';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { textoDecimal } from '@/components/inventario/comandos';

const CATEGORIAS = [
  { value: 'servicios', label: 'Servicios (luz, agua, gas, internet)' },
  { value: 'limpieza', label: 'Limpieza' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'reparacion', label: 'Reparación / mantenimiento' },
  { value: 'pago_extraordinario', label: 'Pago extraordinario' },
  { value: 'marketing', label: 'Marketing / publicidad' },
  { value: 'otro', label: 'Otro' },
];

const PERIODICIDADES = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'anual', label: 'Anual' },
  { value: 'unico', label: 'Único' },
];

/**
 * Dialog para crear/editar una PlantillaGasto.
 * No genera GastoOperativo — solo guarda la plantilla.
 * El usuario decide cuándo "registrar pago" desde la lista.
 */
export default function PlantillaGastoDialog({ open, onClose, plantilla = null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);

  function empty() {
    return {
      nombre: '',
      categoria: 'servicios',
      monto_sugerido: '',
      metodo_pago: 'efectivo',
      periodicidad: 'mensual',
      dia_pago_sugerido: '',
      notas: '',
    };
  }

  useEffect(() => {
    if (open) {
      if (plantilla?.id) {
        setForm({
          nombre: plantilla.nombre || '',
          categoria: plantilla.categoria || 'servicios',
          monto_sugerido: String(plantilla.monto_sugerido || ''),
          metodo_pago: plantilla.metodo_pago || 'efectivo',
          periodicidad: plantilla.periodicidad || 'mensual',
          dia_pago_sugerido: String(plantilla.dia_pago_sugerido || ''),
          notas: plantilla.notas || '',
        });
      } else {
        setForm(empty());
      }
    }
  }, [open, plantilla]);

  const close = () => {
    if (!saving) onClose();
  };

  const handleSave = async () => {
    const nombre = form.nombre.trim();
    const monto = parseFloat(form.monto_sugerido);
    if (!nombre) {
      toast.error('Escribe un nombre identificador');
      return;
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error('Indica un monto sugerido válido');
      return;
    }
    setSaving(true);
    try {
      // `veces_usada` ya no viaja: es un contador que sube `gastos.registrar`
      // cuando el gasto apunta a esta plantilla, no un campo del formulario.
      //
      // Y `activa` sólo se manda al DAR DE ALTA. Se mandaba en `true` también
      // al editar, así que abrir una plantilla eliminada y guardar la resucitaba
      // sin que nadie lo pidiera. Reactivar es una acción propia.
      const diaPago = parseInt(form.dia_pago_sugerido, 10);
      const esAlta = !plantilla?.id;
      await api.comandos.ejecutar('/api/gastos/plantilla', {
        ...(esAlta ? { activa: true } : { plantillaId: plantilla.id }),
        nombre,
        categoria: form.categoria,
        montoSugerido: textoDecimal(monto),
        metodoPago: form.metodo_pago,
        periodicidad: form.periodicidad,
        // El día del mes va de 1 a 31: un 0 no es «sin día», es un día que no
        // existe. Cuando no se captura, el campo sencillamente no se manda.
        ...(Number.isFinite(diaPago) && diaPago >= 1 && diaPago <= 31
          ? { diaPagoSugerido: diaPago }
          : {}),
        ...(form.notas.trim() ? { notas: form.notas.trim() } : {}),
      });
      toast.success(esAlta ? 'Plantilla creada' : 'Plantilla actualizada');
      queryClient.invalidateQueries({ queryKey: ['plantillas_gasto'] });
      close();
    } catch (e) {
      toast.error(e?.message || 'No se pudo guardar la plantilla.');
    }
    setSaving(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {plantilla?.id ? 'Editar plantilla de gasto' : 'Nueva plantilla de gasto'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre identificador *</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Renta local, CFE mensual"
            />
          </div>
          <div>
            <Label className="text-xs">Categoría</Label>
            <Select
              value={form.categoria}
              onValueChange={(v) => setForm({ ...form, categoria: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Monto sugerido *</Label>
              <Input
                type="number"
                value={form.monto_sugerido}
                onChange={(e) => setForm({ ...form, monto_sugerido: e.target.value })}
                placeholder="$0.00"
              />
            </div>
            <div>
              <Label className="text-xs">Periodicidad</Label>
              <Select
                value={form.periodicidad}
                onValueChange={(v) => setForm({ ...form, periodicidad: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODICIDADES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Método de pago</Label>
              <Select
                value={form.metodo_pago}
                onValueChange={(v) => setForm({ ...form, metodo_pago: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Día de pago sugerido</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={form.dia_pago_sugerido}
                onChange={(e) => setForm({ ...form, dia_pago_sugerido: e.target.value })}
                placeholder="Opcional (1-31)"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Input
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Opcional"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Esto solo guarda una plantilla. No registra un gasto hasta que pulses "Registrar pago"
            en la lista de plantillas.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
