'use client';
// =====================================================
// components/inventario/IngredienteContenedorDialog.jsx
// =====================================================
// 6B / Bloque 1.C — Marca/edita un ingrediente como "contenedor".
//
// QUÉ HACE:
//  - Permite cambiar `tipo_ingrediente` entre 'normal' y 'contenedor'.
//  - Captura los defaults de un contenedor (capacidad ml, porciones, ml/porción, nombre).
//  - Persiste SOLO esos campos en el ingrediente. No toca stock ni costo.
//  - No crea MovimientoInventario (no es un ajuste de inventario).
//
// QUÉ NO HACE (regla crítica de estabilidad):
//  - No modifica stock_actual.
//  - No modifica costo_por_unidad_base ni costo_compra_default.
//  - No toca ventas, caja, propinas, tickets ni PDFs.
//  - No toca recetas ni productos. Solo metadatos del ingrediente.
//
// USO TÍPICO:
//  Admin → Inventario → tarjeta "Tequila Reposado" → "Contenedor"
//   → marca como contenedor → captura 750ml, 25 shots, 30ml/shot, "shot".
//  Listo. Ese ingrediente queda disponible como ingrediente_base para
//  productos `porcion_contenedor` en el formulario de producto (1.B).
// =====================================================
import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/api/cliente';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Beaker, Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { mlPorPorcionEfectivo } from '@/utils/tipoVentaUtils';

export default function IngredienteContenedorDialog({ open, onClose, ingrediente }) {
  const queryClient = useQueryClient();

  const [esContenedor, setEsContenedor] = useState(false);
  const [capacidadMl, setCapacidadMl] = useState('');
  const [porciones, setPorciones] = useState('');
  const [mlPorPorcion, setMlPorPorcion] = useState('');
  const [nombrePorcion, setNombrePorcion] = useState('');
  const [saving, setSaving] = useState(false);

  // Hidratar al abrir
  useEffect(() => {
    if (!open || !ingrediente) return;
    setEsContenedor(ingrediente?.tipo_ingrediente === 'contenedor');
    setCapacidadMl(
      ingrediente?.capacidad_contenedor_ml != null
        ? String(ingrediente.capacidad_contenedor_ml)
        : '',
    );
    setPorciones(
      ingrediente?.porciones_por_contenedor_default != null
        ? String(ingrediente.porciones_por_contenedor_default)
        : '',
    );
    setMlPorPorcion(
      ingrediente?.ml_por_porcion_default != null ? String(ingrediente.ml_por_porcion_default) : '',
    );
    setNombrePorcion(ingrediente?.nombre_porcion_default || '');
  }, [open, ingrediente]);

  // ml/porción derivado para mostrar (no se persiste si el usuario no lo captura)
  const mlPorPorcionDerivado = useMemo(() => {
    return mlPorPorcionEfectivo({
      ml_por_porcion: mlPorPorcion === '' ? undefined : Number(mlPorPorcion),
      capacidad_contenedor_ml: capacidadMl === '' ? undefined : Number(capacidadMl),
      porciones_por_contenedor: porciones === '' ? undefined : Number(porciones),
    });
  }, [mlPorPorcion, capacidadMl, porciones]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const handleGuardar = async () => {
    if (!ingrediente?.id) {
      toast.error('Ingrediente inválido.');
      return;
    }

    setSaving(true);
    try {
      // Construir payload con cuidado:
      //  - Si se desmarca como contenedor: regresa a 'normal' y LIMPIA los defaults
      //    (para no dejar valores residuales en BD).
      //  - Si se marca como contenedor: validamos los mínimos.
      let payload;
      if (esContenedor) {
        const capNum = Number(capacidadMl);
        const porNum = Number(porciones);
        if (!Number.isFinite(capNum) || capNum <= 0) {
          toast.error('Capacidad del contenedor debe ser mayor a 0.');
          setSaving(false);
          return;
        }
        if (!Number.isFinite(porNum) || porNum <= 0) {
          toast.error('Porciones por contenedor debe ser mayor a 0.');
          setSaving(false);
          return;
        }
        const mlExp = mlPorPorcion === '' ? undefined : Number(mlPorPorcion);
        if (mlExp !== undefined && (!Number.isFinite(mlExp) || mlExp <= 0)) {
          toast.error('ml por porción inválido.');
          setSaving(false);
          return;
        }
        payload = {
          tipo_ingrediente: 'contenedor',
          capacidad_contenedor_ml: capNum,
          porciones_por_contenedor_default: porNum,
          // Si el usuario dejó ml/porción vacío, persistimos el derivado calculado
          // para que el producto pueda usarlo sin recalcular.
          ml_por_porcion_default: mlExp !== undefined ? mlExp : mlPorPorcionDerivado || undefined,
          nombre_porcion_default: (nombrePorcion || '').trim() || 'shot',
        };
      } else {
        // Volver a 'normal' y limpiar campos de contenedor (no perder datos del usuario
        // si los tenía: mantener los valores en undefined para que BD los borre).
        payload = {
          tipo_ingrediente: 'normal',
          capacidad_contenedor_ml: undefined,
          porciones_por_contenedor_default: undefined,
          ml_por_porcion_default: undefined,
          nombre_porcion_default: '',
        };
      }

      await api.entidades.Ingrediente.update(ingrediente.id, payload);

      // Invalidar lo que dependa de ingredientes (selectores en productos, inventario, etc.)
      [
        'ingredientes_all',
        'ingredientes_dashboard',
        'inventario',
        'ingredientes_activos_tipoventa',
      ].forEach((k) => {
        try {
          queryClient.invalidateQueries({ queryKey: [k] });
        } catch {}
      });

      toast.success(
        esContenedor
          ? `"${ingrediente.nombre}" marcado como contenedor.`
          : `"${ingrediente.nombre}" volvió a ser ingrediente normal.`,
      );
      onClose();
    } catch (err) {
      console.error('[IngredienteContenedorDialog] guardar:', err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!ingrediente) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Beaker className="w-5 h-5 text-primary" />
            Configurar como contenedor
          </DialogTitle>
          <DialogDescription className="text-xs">
            Marca este ingrediente como un <strong>contenedor</strong> (ej. botella) si quieres
            venderlo por porciones (shots, copas, vasos) en productos por porción.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg p-3 bg-muted/40 border">
          <p className="text-sm font-semibold">{ingrediente.nombre}</p>
          <p className="text-xs text-muted-foreground">
            Unidad base: <strong>{ingrediente.unidad_base}</strong>
            {' · '}Stock actual:{' '}
            <strong>
              {Number(ingrediente.stock_actual || 0).toLocaleString()} {ingrediente.unidad_base}
            </strong>
          </p>
        </div>

        <div className="rounded-lg p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-xs flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <p className="text-blue-900 dark:text-blue-100">
            Esto solo cambia metadatos del ingrediente.{' '}
            <strong>No modifica stock, costo ni movimientos</strong>. Lo usarás como ingrediente
            base de productos "por porción".
          </p>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <Label className="text-sm font-semibold">Es contenedor</Label>
            <p className="text-[11px] text-muted-foreground">
              {esContenedor
                ? 'Activo — captura los datos del contenedor.'
                : 'Desactivado — sigue siendo ingrediente normal.'}
            </p>
          </div>
          <Switch checked={esContenedor} onCheckedChange={setEsContenedor} disabled={saving} />
        </div>

        {esContenedor && (
          <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Capacidad por contenedor (ml) *</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={capacidadMl}
                  onChange={(e) => setCapacidadMl(e.target.value)}
                  placeholder="ej. 750"
                />
              </div>
              <div>
                <Label className="text-xs">Porciones por contenedor *</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={porciones}
                  onChange={(e) => setPorciones(e.target.value)}
                  placeholder="ej. 25"
                />
              </div>
              <div>
                <Label className="text-xs">ml por porción (opcional)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={mlPorPorcion}
                  onChange={(e) => setMlPorPorcion(e.target.value)}
                  placeholder={
                    mlPorPorcionDerivado > 0 ? `auto: ${mlPorPorcionDerivado}` : 'ej. 30'
                  }
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Si lo dejas vacío, se calcula: capacidad ÷ porciones.
                </p>
              </div>
              <div>
                <Label className="text-xs">Nombre de la porción *</Label>
                <Input
                  value={nombrePorcion}
                  onChange={(e) => setNombrePorcion(e.target.value)}
                  placeholder="ej. shot, copa, vaso"
                />
              </div>
            </div>

            {mlPorPorcionDerivado > 0 && (
              <div className="text-[11px] text-muted-foreground p-2 rounded-md bg-card border">
                <strong>Resumen:</strong> {capacidadMl || 0} ml por contenedor ÷ {porciones || 0}{' '}
                {nombrePorcion || 'porciones'} ={' '}
                <strong>
                  {mlPorPorcionDerivado} ml por {nombrePorcion || 'porción'}
                </strong>
                .
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
