'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api, nuevaClave } from '@/api/cliente';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import { formatCurrency, formatPercent, calculateMargin } from '@/utils/financialUtils';
import IngredienteAutocomplete from './IngredienteAutocomplete';
import CategoriaSelect from '@/components/productos/CategoriaSelect';
import ImageUploader from '@/components/common/ImageUploader';
import TipoVentaSection from '@/components/productos/TipoVentaSection';
import { TIPO_VENTA, validarProductoVariable, esProductoVariable } from '@/utils/tipoVentaUtils';
import { canonicalUnidad, convertirAUnidadBase } from '@/utils/unidadesMedida';
import { textoDecimal } from '@/components/inventario/comandos';

/**
 * En qué unidades se puede expresar el gramaje de una receta, por unidad base
 * del insumo.
 *
 * Esto existe porque `unidad_usada` era un INPUT DE TEXTO LIBRE y la cantidad
 * se guardaba SIN convertir en `cantidad_convertida_unidad_base`, que es el
 * campo del que el inventario descuenta. Escribir «kg» en un insumo medido en
 * gramos multiplicaba por mil el consumo y el costo de ese platillo: 200 g de
 * queso se convertían en 200 kg descontados de la bodega y en un costo de
 * producción mil veces mayor, con el margen que cuelga de él.
 *
 * Con un selector no se puede teclear una unidad de otra dimensión, y lo que se
 * manda al comando ya va en la unidad base del insumo —que es lo único que
 * `inventario.guardar_receta` acepta: exige que `unidad` sea la del insumo y
 * lanza `UNIDAD_INCOMPATIBLE` si no lo es.
 */
const UNIDADES_DE_RECETA = {
  g: ['g', 'kg'],
  ml: ['ml', 'litro'],
  pieza: ['pieza'],
};

/** Las opciones válidas para un insumo, o sólo su unidad base si es otra. */
function opcionesDeUnidad(unidadBase) {
  return UNIDADES_DE_RECETA[unidadBase] || (unidadBase ? [unidadBase] : []);
}

/**
 * La unidad guardada, traída a una de las opciones del selector.
 *
 * Una receta vieja puede tener «kilogramos», «KG» o —peor— una unidad de otra
 * dimensión escrita a mano. Los alias se reconocen y se muestran en su forma
 * canónica; lo que no encaje cae a la unidad base del insumo, que es la única
 * que el comando va a aceptar de todas formas.
 */
function unidadDeLinea(unidadGuardada, unidadBase) {
  const opciones = opcionesDeUnidad(unidadBase);
  const canon = canonicalUnidad(unidadGuardada);
  return opciones.find((o) => canonicalUnidad(o) === canon) || opciones[0] || '';
}

const EMPTY_PRODUCTO = {
  nombre: '',
  categoria_id: '',
  descripcion: '',
  precio_venta: '',
  imagen_url: '',
  visible_en_pos: true,
  activo: true,
};

// 6B / 1.B — Estado inicial del bloque "tipo de venta".
// Por defecto: precio_fijo (flujo clásico de receta).
const EMPTY_TIPO_VENTA = { tipo_venta: TIPO_VENTA.PRECIO_FIJO };

const EMPTY_LINEA = {
  ingrediente: null,
  cantidad_usada: '',
  unidad_usada: '',
  merma_porcentaje: 0,
};

/**
 * Modal grande para crear/editar receta + producto terminado.
 * - Datos del producto
 * - Ingredientes (con autocomplete vs inventario)
 * - Cálculos en vivo (costo, utilidad, margen)
 * - Al guardar: crea/actualiza ProductoTerminado y RecetaEscandallo lines
 */
export default function RecetaFormDialog({
  open,
  onClose,
  productoToEdit,
  recetaLinesToEdit,
  ingredientes,
  categorias,
}) {
  const queryClient = useQueryClient();
  const [producto, setProducto] = useState(EMPTY_PRODUCTO);
  const [lineas, setLineas] = useState([]);
  const [saving, setSaving] = useState(false);
  // Clave de idempotencia del diálogo: se genera al abrirlo y se reusa mientras
  // siga abierto, para que un doble clic en «Crear receta» no cree dos
  // productos gemelos ni guarde la receta dos veces.
  const claveDelDialogo = useRef(null);
  // 6B / 1.B — Estado del tipo de venta. Independiente del flujo de receta.
  const [tipoVentaState, setTipoVentaState] = useState(EMPTY_TIPO_VENTA);

  // IMPORTANTE: Solo dependemos de `open` y del id del producto a editar
  // (no de la referencia del array recetaLinesToEdit, que cambia en cada render
  // del padre y reseteaba las líneas al pulsar "Agregar ingrediente").
  useEffect(() => {
    if (!open) return;
    claveDelDialogo.current = nuevaClave();
    if (productoToEdit) {
      setProducto({
        nombre: productoToEdit.nombre || '',
        categoria_id: productoToEdit.categoria_id || '',
        descripcion: productoToEdit.descripcion || '',
        precio_venta: productoToEdit.precio_venta ?? '',
        imagen_url: productoToEdit.imagen_url || '',
        visible_en_pos: productoToEdit.visible_en_pos !== false,
        activo: productoToEdit.activo !== false,
      });
      const safeLines = Array.isArray(recetaLinesToEdit) ? recetaLinesToEdit : [];
      const safeIngs = Array.isArray(ingredientes) ? ingredientes : [];
      const initialLineas = safeLines.map((l) => {
        const ing = safeIngs.find((i) => i.id === l.ingrediente_id);
        const respaldo = {
          id: l.ingrediente_id,
          nombre: l.ingrediente_nombre,
          unidad_base: l.unidad_usada,
          costo_por_unidad_base: l.costo_unitario_base_snapshot,
          stock_actual: 0,
        };
        const ingrediente = ing || respaldo;
        return {
          id: l.id,
          ingrediente,
          cantidad_usada: l.cantidad_usada,
          // Se normaliza al abrir: una línea vieja guardada con «kilogramos» o
          // con una unidad de otra dimensión tiene que caer en una opción real
          // del selector, no dejarlo en blanco.
          unidad_usada: unidadDeLinea(l.unidad_usada, ingrediente.unidad_base),
          merma_porcentaje: l.merma_porcentaje || 0,
        };
      });
      setLineas(initialLineas);
      // 6B / 1.B — Hidratar tipo de venta desde el producto a editar.
      setTipoVentaState({
        tipo_venta: productoToEdit.tipo_venta || TIPO_VENTA.PRECIO_FIJO,
        ingrediente_base_id: productoToEdit.ingrediente_base_id || '',
        ingrediente_base_nombre: productoToEdit.ingrediente_base_nombre || '',
        unidad_variable: productoToEdit.unidad_variable || '',
        precio_por_unidad_variable: productoToEdit.precio_por_unidad_variable,
        cantidad_minima_variable: productoToEdit.cantidad_minima_variable,
        cantidad_maxima_variable: productoToEdit.cantidad_maxima_variable,
        incremento_variable: productoToEdit.incremento_variable,
        presets_variable_qr: Array.isArray(productoToEdit.presets_variable_qr)
          ? productoToEdit.presets_variable_qr
          : [],
        capacidad_contenedor_ml: productoToEdit.capacidad_contenedor_ml,
        porciones_por_contenedor: productoToEdit.porciones_por_contenedor,
        ml_por_porcion: productoToEdit.ml_por_porcion,
        nombre_porcion: productoToEdit.nombre_porcion || '',
        precio_por_porcion: productoToEdit.precio_por_porcion,
        presets_porcion_qr: Array.isArray(productoToEdit.presets_porcion_qr)
          ? productoToEdit.presets_porcion_qr
          : [],
      });
    } else {
      setProducto(EMPTY_PRODUCTO);
      setLineas([]);
      setTipoVentaState(EMPTY_TIPO_VENTA);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productoToEdit?.id]);

  const calc = useMemo(() => {
    let costo = 0;
    const detalle = lineas.map((l) => {
      if (!l.ingrediente) return { ...l, costoLinea: 0 };
      // La cantidad se lleva a la unidad base ANTES de multiplicar por el
      // costo, que está por unidad base. Sin esta conversión la vista previa
      // de «0.2 kg» de un insumo en gramos enseñaba un costo mil veces menor
      // que el real — el mismo error de mil que se guardaba en la receta.
      const cant = convertirAUnidadBase(
        parseFloat(l.cantidad_usada) || 0,
        l.unidad_usada || l.ingrediente.unidad_base,
        1,
      );
      const merma = 1 + (parseFloat(l.merma_porcentaje) || 0) / 100;
      const costoUnit = l.ingrediente.costo_por_unidad_base || 0;
      const costoLinea = cant * merma * costoUnit;
      costo += costoLinea;
      return { ...l, costoLinea };
    });
    const precio = parseFloat(producto.precio_venta) || 0;
    const utilidad = precio - costo;
    const margen = calculateMargin(precio, costo);
    return { costo, utilidad, margen, detalle };
  }, [lineas, producto.precio_venta]);

  const addLinea = () => setLineas((prev) => [...prev, { ...EMPTY_LINEA }]);
  const removeLinea = (idx) => setLineas((prev) => prev.filter((_, i) => i !== idx));
  const updateLinea = (idx, patch) =>
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const handleSelectIng = (idx, ing) => {
    updateLinea(idx, { ingrediente: ing, unidad_usada: unidadDeLinea(ing.unidad_base, ing.unidad_base) });
  };

  const validate = () => {
    if (!producto.nombre.trim()) {
      toast.error('Falta el nombre del producto');
      return false;
    }
    if (!producto.precio_venta || parseFloat(producto.precio_venta) <= 0) {
      toast.error('Precio de venta inválido');
      return false;
    }
    for (const l of lineas) {
      if (!l.ingrediente) {
        toast.error('Hay ingredientes sin seleccionar');
        return false;
      }
      if (!l.cantidad_usada || parseFloat(l.cantidad_usada) <= 0) {
        toast.error(`Cantidad inválida para ${l.ingrediente.nombre}`);
        return false;
      }
    }
    // Vaciar del todo una receta que ya existía dejaría la vieja viva:
    // `guardar_receta` exige al menos un ingrediente y desde aquí no hay forma
    // de borrarla sin más. Para retirarla entera está «Eliminar receta», que
    // además archiva el producto en la misma transacción.
    if (lineas.length === 0 && (recetaLinesToEdit || []).length > 0) {
      toast.error('Agrega al menos un ingrediente para calcular el costo');
      return false;
    }
    // 6B / 1.B — Validación adicional si es variable.
    if (esProductoVariable(tipoVentaState)) {
      const { ok, errores } = validarProductoVariable(tipoVentaState);
      if (!ok) {
        toast.error(errores[0] || 'Revisa el tipo de venta.');
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // `categoria_nombre` ya NO se manda. Es un derivado del puente: sale del
      // `join` con `categorias` al leer, así que no tiene columna donde
      // guardarse y mandarlo se rechaza. Con él se va la lectura de respaldo
      // que tenía un `.catch {}` y que, al fallar, guardaba una instantánea de
      // categoría vacía para siempre (F1-06 §4).
      //
      // 6B / 1.B — Campos de tipo_venta. Solo se incluyen si el producto
      // es variable; en caso contrario se persiste 'precio_fijo' explícito
      // para limpiar valores antiguos al cambiar de variable → fijo.
      const tipoVentaPayload = esProductoVariable(tipoVentaState)
        ? {
            tipo_venta: tipoVentaState.tipo_venta,
            // `null`, no cadena vacía: la columna es un uuid y '' no lo es.
            // `ingrediente_base_nombre` tampoco viaja — es otro derivado.
            ingrediente_base_id: tipoVentaState.ingrediente_base_id || null,
            unidad_variable: tipoVentaState.unidad_variable || '',
            precio_por_unidad_variable: tipoVentaState.precio_por_unidad_variable,
            cantidad_minima_variable: tipoVentaState.cantidad_minima_variable,
            cantidad_maxima_variable: tipoVentaState.cantidad_maxima_variable,
            incremento_variable: tipoVentaState.incremento_variable,
            presets_variable_qr: Array.isArray(tipoVentaState.presets_variable_qr)
              ? tipoVentaState.presets_variable_qr
              : [],
            capacidad_contenedor_ml: tipoVentaState.capacidad_contenedor_ml,
            porciones_por_contenedor: tipoVentaState.porciones_por_contenedor,
            ml_por_porcion: tipoVentaState.ml_por_porcion,
            nombre_porcion: tipoVentaState.nombre_porcion || '',
            precio_por_porcion: tipoVentaState.precio_por_porcion,
            presets_porcion_qr: Array.isArray(tipoVentaState.presets_porcion_qr)
              ? tipoVentaState.presets_porcion_qr
              : [],
          }
        : { tipo_venta: TIPO_VENTA.PRECIO_FIJO };

      // El costo, la utilidad y el margen NO viajan. Son columnas que el
      // servidor calcula —`margen_bp` y `utilidad_unitaria` son generadas en la
      // base— y `inventario.guardar_receta` las recalcula sumando las líneas al
      // guardarlas. Mandarlas desde el navegador era D-09: márgenes inventados
      // en coma flotante que dejaban de corresponder a la receta guardada.
      const productoData = {
        nombre: producto.nombre.trim(),
        categoria_id: producto.categoria_id || null,
        descripcion: producto.descripcion || '',
        precio_venta: parseFloat(producto.precio_venta),
        imagen_url: producto.imagen_url || '',
        area_preparacion: 'cocina',
        visible_en_pos: producto.visible_en_pos,
        visible_en_menu_digital: true,
        activo: producto.activo,
        ...tipoVentaPayload,
      };

      let productoId;
      if (productoToEdit) {
        await api.entidades.ProductoTerminado.update(productoToEdit.id, productoData);
        productoId = productoToEdit.id;
      } else {
        const created = await api.entidades.ProductoTerminado.create(productoData);
        productoId = created.id;
      }

      // ── D-11: la receta se reemplaza entera o no se toca ──────────────────
      // Antes esto era «borrar las N líneas viejas, después crear las M
      // nuevas», sin transacción. Si fallaba a mitad, el producto se quedaba
      // con media receta —o con ninguna— y su costo, su utilidad y su margen
      // pasaban a describir algo que no existía. `guardar_receta` borra e
      // inserta dentro de la misma transacción y recalcula el costo al final.
      //
      // Lo que se manda es la cantidad YA EN LA UNIDAD BASE del insumo, que es
      // la única que el comando acepta; y la merma en puntos base, que es como
      // la guarda la base (`merma_bp`), no en porcentaje.
      if (lineas.length > 0) {
        await api.comandos.ejecutar(
          '/api/inventario/recetas',
          {
            productoId,
            ingredientes: lineas.map((l) => ({
              insumoId: l.ingrediente.id,
              cantidad: textoDecimal(
                convertirAUnidadBase(
                  parseFloat(l.cantidad_usada) || 0,
                  l.unidad_usada || l.ingrediente.unidad_base,
                  1,
                ),
              ),
              unidad: l.ingrediente.unidad_base,
              mermaBp: Math.min(
                10000,
                Math.max(0, Math.round((parseFloat(l.merma_porcentaje) || 0) * 100)),
              ),
            })),
          },
          claveDelDialogo.current,
        );
      }

      queryClient.invalidateQueries({ queryKey: ['productos_all'] });
      queryClient.invalidateQueries({ queryKey: ['productos_pos'] });
      queryClient.invalidateQueries({ queryKey: ['recetas_all'] });
      toast.success(
        productoToEdit ? 'Receta actualizada' : '¡Receta creada! Producto agregado al catálogo',
      );
      onClose();
    } catch (e) {
      // El mensaje del dominio ya viene en español y dice exactamente qué pasó
      // («La unidad de la receta debe coincidir con la del insumo»). Se enseña
      // tal cual: el genérico de antes no dejaba corregir nada.
      toast.error(e?.message || 'No se pudo guardar la receta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {productoToEdit ? 'Editar receta' : 'Nueva receta'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* DATOS DEL PRODUCTO */}
          <section className="space-y-3 p-4 rounded-xl bg-muted/30 border">
            <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Datos del producto
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Nombre del producto *</Label>
                <Input
                  value={producto.nombre}
                  onChange={(e) => setProducto({ ...producto, nombre: e.target.value })}
                  placeholder="Ej: Capuchino"
                />
              </div>
              <div>
                <Label className="text-xs">Categoría</Label>
                <CategoriaSelect
                  value={producto.categoria_id}
                  onChange={(id) => setProducto({ ...producto, categoria_id: id })}
                  categorias={categorias}
                  placeholder="Seleccionar…"
                />
              </div>
              <div>
                <Label className="text-xs">Precio de venta *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={producto.precio_venta}
                  onChange={(e) => setProducto({ ...producto, precio_venta: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Descripción</Label>
                <Textarea
                  value={producto.descripcion}
                  onChange={(e) => setProducto({ ...producto, descripcion: e.target.value })}
                  placeholder="Descripción breve..."
                  rows={2}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Imagen del producto</Label>
                <div className="mt-1">
                  <ImageUploader
                    value={producto.imagen_url}
                    onChange={(url) => setProducto({ ...producto, imagen_url: url })}
                    height={150}
                    label="Subir imagen del producto"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between sm:col-span-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={producto.activo}
                      onCheckedChange={(v) => setProducto({ ...producto, activo: v })}
                    />
                    <Label className="text-xs">Activo</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={producto.visible_en_pos}
                      onCheckedChange={(v) => setProducto({ ...producto, visible_en_pos: v })}
                    />
                    <Label className="text-xs">Visible en POS</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* 6B / 1.B — Tipo de venta. Default: Precio fijo (flujo clásico).
                NO afecta el cálculo de costo/utilidad/margen basado en RecetaEscandallo. */}
            <TipoVentaSection
              value={tipoVentaState}
              onChange={(patch) => setTipoVentaState((prev) => ({ ...prev, ...patch }))}
              ingredientes={ingredientes}
            />
          </section>

          {/* 6B / Hotfix visual — Ingredientes / Costeo de producción: SOLO para
              productos precio_fijo. En productos variables, la unidad de cobro y
              el descuento de inventario los maneja "tipo_venta" (TipoVentaSection).
              Mostrar la receta clásica aquí confunde al usuario. */}
          {!esProductoVariable(tipoVentaState) && (
            <section className="space-y-3 p-4 rounded-xl bg-muted/30 border">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                  Ingredientes / Costeo de producción
                </h3>
                <Button size="sm" variant="outline" onClick={addLinea}>
                  <Plus className="w-4 h-4 mr-1" /> Agregar ingrediente
                </Button>
              </div>

              {lineas.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Agrega al menos un ingrediente para calcular el costo
                </div>
              )}

              <div className="space-y-2">
                {calc.detalle.map((l, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-white border"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Ingrediente
                      </Label>
                      <IngredienteAutocomplete
                        ingredientes={ingredientes}
                        value={l.ingrediente}
                        onSelect={(ing) => handleSelectIng(idx, ing)}
                      />
                      {l.ingrediente && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Stock: {Number(l.ingrediente.stock_actual || 0).toLocaleString()}{' '}
                          {l.ingrediente.unidad_base}
                          {' · '}
                          {formatCurrency(l.ingrediente.costo_por_unidad_base)}/
                          {l.ingrediente.unidad_base}
                        </p>
                      )}
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Cantidad
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={l.cantidad_usada}
                        onChange={(e) => updateLinea(idx, { cantidad_usada: e.target.value })}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">Unidad</Label>
                      {/* Selector, no texto libre: es lo que impide escribir
                          «kg» en un insumo medido en gramos y multiplicar por
                          mil el consumo y el costo del platillo. */}
                      <Select
                        value={l.unidad_usada || l.ingrediente?.unidad_base || ''}
                        onValueChange={(v) => updateLinea(idx, { unidad_usada: v })}
                        disabled={!l.ingrediente}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {opcionesDeUnidad(l.ingrediente?.unidad_base).map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        Costo línea
                      </Label>
                      <p className="h-9 flex items-center font-bold text-sm">
                        {formatCurrency(l.costoLinea)}
                      </p>
                    </div>
                    <div className="col-span-1">
                      <Button variant="ghost" size="icon" onClick={() => removeLinea(idx)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 6B / Hotfix visual — Resumen en vivo del escandallo clásico: solo
              precio_fijo. Para variables, el resumen real (precio/costo/utilidad/
              margen por unidad vendible o porción) ya vive en TipoVentaSection. */}
          {!esProductoVariable(tipoVentaState) && (
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <Stat
                label="Costo producción"
                value={formatCurrency(calc.costo)}
                color="text-orange-700"
              />
              <Stat
                label="Precio venta"
                value={formatCurrency(parseFloat(producto.precio_venta) || 0)}
              />
              <Stat
                label="Utilidad bruta"
                value={formatCurrency(calc.utilidad)}
                color="text-emerald-700"
              />
              <Stat
                label="Margen"
                value={formatPercent(calc.margen)}
                color={
                  calc.margen >= 60
                    ? 'text-emerald-700'
                    : calc.margen >= 40
                      ? 'text-yellow-700'
                      : 'text-red-700'
                }
              />
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Guardando...' : productoToEdit ? 'Guardar cambios' : 'Crear receta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-heading font-black text-lg ${color || ''}`}>{value}</p>
    </div>
  );
}
