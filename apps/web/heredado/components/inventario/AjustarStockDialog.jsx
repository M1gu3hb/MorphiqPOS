'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { api, nuevaClave } from '@/api/cliente';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Save, Sliders, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useConfig } from '@/lib/ConfigContext';
import {
  getUnidadesCompra,
  esUnidadEstandar,
  validarCompatibilidad,
  convertirAUnidadBase,
  canonicalUnidad,
} from '@/utils/unidadesMedida';
import StockMinCritInput from '@/components/inventario/StockMinCritInput';
import { obtenerAlmacenPrincipalId, textoDecimal } from '@/components/inventario/comandos';

/** Lo que cabe en `entradaAjustarStock.motivo` (`.max(300)`). */
const MAXIMO_MOTIVO = 300;

/**
 * AjustarStockDialog
 * ------------------
 * Ajuste MANUAL de stock — NO crea compra, NO crea gasto, NO crea venta.
 * Registra un movimiento de ajuste en el ledger, con motivo y referencia
 * manual, y la existencia se mueve con él.
 *
 * Casos: conteo físico, merma, entrada/salida manual, corrección.
 *
 * Validaciones:
 *  - Cantidad > 0 y numérica.
 *  - Unidad compatible con unidad base del ingrediente.
 *  - Equivalencia obligatoria para unidades personalizadas o empaques.
 *  - Motivo obligatorio.
 *  - Stock resultante no negativo (salvo `permitir_venta_sin_stock`).
 *
 * ── D-06: el stock ya no se escribe ────────────────────────────────────────
 * Este diálogo hacía `Ingrediente.update({stock_actual})` y después creaba el
 * `MovimientoInventario` a mano, con un rollback del stock si el movimiento
 * fallaba. Eran dos escrituras sin transacción sobre un número que dos cajas
 * cobrando a la vez se pisan: el clásico leer-calcular-escribir. Ahora va
 * `inventario.ajustar`, que suma el delta a la existencia con un `update ... set
 * cantidad = cantidad + delta` y escribe el movimiento en la MISMA transacción.
 * No hay rollback que hacer desde el navegador porque no hay medio camino.
 */
export default function AjustarStockDialog({ open, onClose, ingrediente }) {
  // `posUser` ya no se manda: quién ajusta lo pone el servidor con el empleo de
  // la sesión (`ctx.ambito.empleoId`). Un `usuario_id` que viaja en el cuerpo
  // es un dato que el cliente puede escribir, y el ledger no acepta eso.
  const { config } = useConfig();
  const queryClient = useQueryClient();

  const unidadesDisponibles = useMemo(() => getUnidadesCompra(config), [config]);
  // Ajustes manuales NUNCA permiten stock negativo. `permitir_venta_sin_stock`
  // aplica solo a ventas (cobro), no a correcciones de inventario.

  const [tipoAjuste, setTipoAjuste] = useState('correccion');
  const [metodo, setMetodo] = useState('final'); // 'final' | 'diferencia'
  const [signo, setSigno] = useState('sumar'); // solo aplica si metodo='diferencia'
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState('');
  const [equivalencia, setEquivalencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  // Alertas de inventario — mínimo/crítico en unidad base.
  // El usuario los captura con unidad clara (kg/l/pza) y el componente convierte.
  // null = no se tocan en este guardado. Solo se persisten si el usuario los edita.
  const [alertas, setAlertas] = useState(null); // { stock_minimo, stock_critico } en base, o null

  // La clave de idempotencia del diálogo: se genera al abrirlo y se reusa
  // mientras siga abierto. Es lo que hace que un doble clic en «Guardar
  // ajuste» —o un reintento de red— descuente una vez y no dos.
  const claveDelDialogo = useRef(null);

  // Reset cuando se abre / cambia ingrediente
  useEffect(() => {
    if (open && ingrediente) {
      claveDelDialogo.current = nuevaClave();
      setTipoAjuste('correccion');
      setMetodo('final');
      setSigno('sumar');
      setCantidad('');
      // Unidad inicial = la base del ingrediente (más simple y siempre compatible)
      setUnidad(ingrediente.unidad_base || 'g');
      setEquivalencia('');
      setMotivo('');
      setAlertas(null);
    }
  }, [open, ingrediente]);

  if (!ingrediente) return null;

  const stockActual = Number(ingrediente.stock_actual) || 0;
  const unidadBase = ingrediente.unidad_base;

  // ¿Esta unidad requiere equivalencia? (no es estándar directa)
  const necesitaEquivalencia = (() => {
    const canon = canonicalUnidad(unidad);
    return canon === null; // null = personalizada o empaque (caja, paquete, bolsa…)
  })();

  // Validar compatibilidad de unidad ↔ unidad base
  const compat = validarCompatibilidad(unidad, unidadBase);

  // Cálculo de stock nuevo (preview)
  const cantNum = parseFloat(cantidad);
  const cantValida = Number.isFinite(cantNum) && cantNum > 0;
  let cantidadEnBase = 0;
  if (cantValida && compat.compatible) {
    const eq = parseFloat(equivalencia);
    if (necesitaEquivalencia) {
      if (Number.isFinite(eq) && eq > 0) {
        cantidadEnBase = convertirAUnidadBase(cantNum, unidad, eq);
      }
    } else {
      cantidadEnBase = convertirAUnidadBase(cantNum, unidad, 1);
    }
  }

  let stockNuevo = stockActual;
  let cambio = 0;
  if (cantValida && cantidadEnBase > 0) {
    if (metodo === 'final') {
      stockNuevo = cantidadEnBase;
      cambio = stockNuevo - stockActual;
    } else {
      cambio = signo === 'sumar' ? cantidadEnBase : -cantidadEnBase;
      stockNuevo = stockActual + cambio;
    }
  }

  const stockQuedariaNegativo = stockNuevo < 0;
  const stockNoCambia = cantValida && cambio === 0;

  const close = () => {
    if (saving) return;
    onClose();
  };

  // ¿El usuario solo quiere actualizar las alertas (mínimo/crítico) y NO
  // ajustar el stock actual? Esto es válido: detecta si tocó alertas y dejó
  // la cantidad vacía. Permite editar mínimo/crítico sin obligar a registrar
  // un ajuste de stock.
  const soloEditarAlertas = alertas !== null && !cantidad && !motivo;

  const guardar = async () => {
    // Caso especial: solo se están editando las alertas (sin ajuste de stock).
    if (soloEditarAlertas) {
      setSaving(true);
      try {
        await api.entidades.Ingrediente.update(ingrediente.id, {
          stock_minimo: Math.max(0, Number(alertas.stock_minimo) || 0),
          stock_critico: Math.max(0, Number(alertas.stock_critico) || 0),
        });
        ['ingredientes_all', 'ingredientes_dashboard', 'inventario'].forEach((k) => {
          try {
            queryClient.invalidateQueries({ queryKey: [k] });
          } catch {}
        });
        toast.success('Alertas actualizadas');
        onClose();
      } catch (e) {
        console.error('[AjustarStockDialog] update alertas:', e);
        toast.error('No se pudieron guardar las alertas');
      }
      setSaving(false);
      return;
    }

    // ===== Validaciones (ajuste de stock) =====
    if (!cantValida) {
      toast.error('Indica una cantidad válida (mayor que cero).');
      return;
    }
    if (!compat.compatible) {
      toast.error(
        compat.mensaje ||
          'La unidad seleccionada no es compatible con la unidad base del ingrediente.',
      );
      return;
    }
    if (necesitaEquivalencia) {
      const eq = parseFloat(equivalencia);
      if (!Number.isFinite(eq) || eq <= 0) {
        toast.error(`Indica a cuánto equivale 1 ${unidad} en ${unidadBase}.`);
        return;
      }
    }
    if (!motivo.trim()) {
      toast.error('Indica el motivo del ajuste.');
      return;
    }
    if (stockNoCambia) {
      toast.error('El stock nuevo es igual al stock actual.');
      return;
    }
    // BLINDAJE: Los ajustes manuales NUNCA permiten stock negativo,
    // sin importar la configuración de venta sin stock.
    if (stockQuedariaNegativo) {
      toast.error('El ajuste dejaría el stock en negativo.');
      return;
    }

    setSaving(true);

    const ingredienteIdRef = ingrediente.id;

    try {
      // 1) Las alertas SÍ siguen siendo columnas escribibles del insumo, así que
      //    van por el puente. Primero: si fallan, no ha pasado nada más y el
      //    error que ve el usuario es el de verdad.
      if (alertas !== null) {
        await api.entidades.Ingrediente.update(ingredienteIdRef, {
          stock_minimo: Math.max(0, Number(alertas.stock_minimo) || 0),
          stock_critico: Math.max(0, Number(alertas.stock_critico) || 0),
        });
      }

      // 2) El ajuste. Una sola llamada mueve la existencia Y escribe el
      //    movimiento del ledger dentro de la misma transacción, así que ya no
      //    hay «stock movido sin movimiento que lo respalde» que revertir.
      const tipoLegible =
        {
          correccion: 'Corrección de conteo',
          merma: 'Merma',
          entrada: 'Entrada manual',
          salida: 'Salida manual',
          otro: 'Otro ajuste',
        }[tipoAjuste] || 'Ajuste manual';

      const motivoFinal = `${tipoLegible}: ${motivo.trim()}`.slice(0, MAXIMO_MOTIVO);
      const almacenId = await obtenerAlmacenPrincipalId();

      // Se manda el DELTA con signo, no el stock final: sumar es lo que dos
      // ajustes simultáneos pueden hacer sin pisarse. El costo del movimiento
      // lo pone el servidor con el costo del insumo — un ajuste manual no
      // recalibra el costo ponderado, igual que antes.
      const resultado = await api.comandos.ejecutar(
        '/api/inventario/ajustar',
        {
          almacenId,
          insumoId: ingredienteIdRef,
          cantidad: textoDecimal(cambio),
          motivo: motivoFinal,
        },
        claveDelDialogo.current,
      );

      // 3) Invalidar caches relevantes — refrescar la cantidad sin recargar.
      [
        'ingredientes_all',
        'ingredientes_dashboard',
        'movimientos_inventario',
        'movimientos_inv',
        'registros_movimientos',
        'inventario',
      ].forEach((k) => {
        try {
          queryClient.invalidateQueries({ queryKey: [k] });
        } catch {}
      });

      // El saldo que se enseña es el que devolvió la transacción, no el que
      // había calculado la pantalla: si otra caja movió el mismo insumo entre
      // la carga y el guardado, éste es el número que quedó en la base.
      const saldoFinal = Number(resultado?.cantidad ?? stockNuevo);
      toast.success(
        `Stock actualizado — ${ingrediente.nombre}: ${saldoFinal.toLocaleString()} ${unidadBase}`,
      );
      onClose();
    } catch (e) {
      // El dominio ya trae el mensaje en español —«El ajuste dejaría una
      // existencia negativa», «El insumo o almacén no existe»— y decirlo tal
      // cual es lo que permite corregir. El genérico de antes no decía nada.
      toast.error(e?.message || 'No se pudo ajustar el stock.');
      try {
        queryClient.invalidateQueries({ queryKey: ['ingredientes_all'] });
      } catch {}
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
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            Ajustar stock
          </DialogTitle>
          <DialogDescription className="text-xs">
            Solo modifica el inventario. <strong>No se registra como compra, gasto ni venta</strong>
            .
          </DialogDescription>
        </DialogHeader>

        {/* Encabezado del ingrediente */}
        <div className="rounded-lg p-3 bg-muted/50 border">
          <p className="text-sm font-semibold">{ingrediente.nombre}</p>
          <p className="text-xs text-muted-foreground">
            Stock actual:{' '}
            <strong>
              {stockActual.toLocaleString()} {unidadBase}
            </strong>
          </p>
        </div>

        {/* Tipo de ajuste */}
        <div>
          <Label className="text-xs">Tipo de ajuste *</Label>
          <Select value={tipoAjuste} onValueChange={setTipoAjuste}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="correccion">Corrección de conteo</SelectItem>
              <SelectItem value="merma">Merma / producto perdido</SelectItem>
              <SelectItem value="entrada">Entrada manual</SelectItem>
              <SelectItem value="salida">Salida manual</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Método de ajuste */}
        <div>
          <Label className="text-xs">Método *</Label>
          <Select value={metodo} onValueChange={setMetodo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="final">Definir stock final (conteo físico)</SelectItem>
              <SelectItem value="diferencia">Sumar / restar diferencia</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cantidad + unidad (+ signo si aplica) */}
        <div className="grid grid-cols-3 gap-2">
          {metodo === 'diferencia' && (
            <div className="col-span-3">
              <Label className="text-xs">Sumar o restar *</Label>
              <Select value={signo} onValueChange={setSigno}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sumar">Sumar (+)</SelectItem>
                  <SelectItem value="restar">Restar (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-xs">
              {metodo === 'final' ? 'Nuevo stock real *' : 'Cantidad a ajustar *'}
            </Label>
            <Input
              type="number"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs">Unidad *</Label>
            <Select value={unidad} onValueChange={setUnidad}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unidadesDisponibles.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Warning de compatibilidad */}
        {!compat.compatible && (
          <div className="rounded-lg p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800/60 text-xs text-rose-900 dark:text-rose-200 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{compat.mensaje}</span>
          </div>
        )}

        {/* Equivalencia obligatoria si es unidad personalizada o empaque */}
        {necesitaEquivalencia && (
          <div className="rounded-lg p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
            <Label className="text-xs">
              ¿A cuánto equivale 1 {unidad} en {unidadBase}? *
            </Label>
            <Input
              type="number"
              value={equivalencia}
              onChange={(e) => setEquivalencia(e.target.value)}
              placeholder={
                unidadBase === 'g'
                  ? 'Ej: 1000 (gramos por bolsa)'
                  : unidadBase === 'ml'
                    ? 'Ej: 20000 (ml por garrafón)'
                    : 'Ej: 24 (piezas por caja)'
              }
              className="h-8"
            />
            <p className="text-[10px] text-amber-800 dark:text-amber-200 mt-1">
              {esUnidadEstandar(unidad)
                ? 'Esta unidad es un empaque — indica cuánto trae cada uno.'
                : 'Esta es una unidad personalizada. Necesitamos su equivalencia para calcular el ajuste.'}
            </p>
          </div>
        )}

        {/* Motivo */}
        <div>
          <Label className="text-xs">Motivo / nota *</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: conteo físico inicial, merma por producto caducado, corrección de captura, etc."
            className="min-h-[60px] text-sm"
          />
        </div>

        {/* ===== Alertas de inventario (mínimo / crítico) =====
            Sección secundaria, opcional. Permite al admin editar los umbrales
            de alerta con UNIDAD CLARA (kg/l/pza) — el componente convierte
            internamente a unidad base. Si no se toca, no se modifica.
            NO afecta cálculos financieros ni descuento de inventario. */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Alertas de inventario (opcional)
          </p>
          <StockMinCritInput
            unidadBase={unidadBase}
            valoresEnBase={{
              stock_minimo: alertas?.stock_minimo ?? (Number(ingrediente.stock_minimo) || 0),
              stock_critico: alertas?.stock_critico ?? (Number(ingrediente.stock_critico) || 0),
            }}
            onChange={(v) => setAlertas(v)}
            compact
          />
          {alertas && !cantidad && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Puedes guardar solo los cambios de alertas (sin ajustar el stock actual).
            </p>
          )}
        </div>

        {/* Vista previa del ajuste */}
        {cantValida &&
          compat.compatible &&
          (!necesitaEquivalencia || parseFloat(equivalencia) > 0) && (
            <div className="rounded-lg p-3 bg-primary/5 border border-primary/20 text-sm space-y-1">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Vista previa</p>
              <div className="flex justify-between">
                <span>Stock anterior</span>
                <strong>
                  {stockActual.toLocaleString()} {unidadBase}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Ajuste aplicado</span>
                <strong className={cambio < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                  {cambio >= 0 ? '+' : ''}
                  {cambio.toLocaleString()} {unidadBase}
                </strong>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span>Stock nuevo</span>
                <strong className={stockQuedariaNegativo ? 'text-rose-600' : ''}>
                  {stockNuevo.toLocaleString()} {unidadBase}
                </strong>
              </div>
              {stockQuedariaNegativo && (
                <p className="text-[11px] text-rose-600 pt-1">
                  ⚠ El ajuste dejaría el stock en negativo. No se permite.
                </p>
              )}
              {stockNoCambia && (
                <p className="text-[11px] text-amber-700 pt-1">
                  El stock nuevo es igual al stock actual.
                </p>
              )}
            </div>
          )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Guardando...' : 'Guardar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
