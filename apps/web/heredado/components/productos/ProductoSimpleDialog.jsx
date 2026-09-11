'use client';
import React, { useState, useEffect } from 'react';
import { api } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import CategoriaSelect from './CategoriaSelect';
import ImageUploader from '@/components/common/ImageUploader';
import { ensureCategoriaExists } from '@/utils/categoriaUtils';
import TipoVentaSection from './TipoVentaSection';
import { TIPO_VENTA, validarProductoVariable, esProductoVariable } from '@/utils/tipoVentaUtils';

/**
 * Formulario simple para crear/editar un ProductoTerminado en paquete Esencial.
 * Nombre, categoría (con opción "Nueva categoría…"), imagen, precio, activo.
 * Si no se elige categoría, asigna "General" por defecto (auto-creada).
 */
export default function ProductoSimpleDialog({ open, onClose, producto = null }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);
  const [categoriaId, setCategoriaId] = useState('');
  const [categoriaNombre, setCategoriaNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  // 6B / 1.B — Estado del tipo de venta. Default: precio_fijo (flujo clásico).
  const [tipoVentaState, setTipoVentaState] = useState({ tipo_venta: TIPO_VENTA.PRECIO_FIJO });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias_producto'],
    queryFn: () => api.entidades.CategoriaProducto.filter({ activo: true }),
    initialData: [],
  });

  // 6B / 1.B — Ingredientes activos para selector de ingrediente base.
  // Si no hay ingredientes, los campos variables se muestran deshabilitados.
  const { data: ingredientes = [] } = useQuery({
    queryKey: ['ingredientes_activos_tipoventa'],
    queryFn: () => api.entidades.Ingrediente.filter({ activo: true }),
    initialData: [],
  });

  useEffect(() => {
    if (open) {
      setNombre(producto?.nombre || '');
      setPrecio(producto?.precio_venta != null ? String(producto.precio_venta) : '');
      setImagenUrl(producto?.imagen_url || '');
      setDescripcion(producto?.descripcion || '');
      setActivo(producto?.activo !== false);
      setCategoriaId(producto?.categoria_id || '');
      setCategoriaNombre(producto?.categoria_nombre || '');
      // Hidratar tipo de venta desde el producto (si existe). Por defecto, precio_fijo.
      setTipoVentaState({
        tipo_venta: producto?.tipo_venta || TIPO_VENTA.PRECIO_FIJO,
        ingrediente_base_id: producto?.ingrediente_base_id || '',
        ingrediente_base_nombre: producto?.ingrediente_base_nombre || '',
        unidad_variable: producto?.unidad_variable || '',
        precio_por_unidad_variable: producto?.precio_por_unidad_variable,
        cantidad_minima_variable: producto?.cantidad_minima_variable,
        cantidad_maxima_variable: producto?.cantidad_maxima_variable,
        incremento_variable: producto?.incremento_variable,
        presets_variable_qr: Array.isArray(producto?.presets_variable_qr)
          ? producto.presets_variable_qr
          : [],
        capacidad_contenedor_ml: producto?.capacidad_contenedor_ml,
        porciones_por_contenedor: producto?.porciones_por_contenedor,
        ml_por_porcion: producto?.ml_por_porcion,
        nombre_porcion: producto?.nombre_porcion || '',
        precio_por_porcion: producto?.precio_por_porcion,
        presets_porcion_qr: Array.isArray(producto?.presets_porcion_qr)
          ? producto.presets_porcion_qr
          : [],
      });
    }
  }, [open, producto]);

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      toast.error('Falta el nombre del producto');
      return;
    }
    const precioNum = parseFloat(precio);
    if (!precioNum || precioNum <= 0) {
      toast.error('Precio inválido');
      return;
    }

    // 6B / 1.B — Validar configuración de tipo_venta si es variable.
    if (esProductoVariable(tipoVentaState)) {
      const { ok, errores } = validarProductoVariable(tipoVentaState);
      if (!ok) {
        toast.error(errores[0] || 'Revisa la configuración de tipo de venta.');
        return;
      }
    }

    setGuardando(true);
    try {
      // Resolver categoría: la elegida, o "General" como fallback (solo en creación).
      let catId = categoriaId;
      let catNombre = categoriaNombre;
      if (!catId) {
        const cat = await ensureCategoriaExists(api, 'General', { reactivate: true });
        catId = cat.id;
        catNombre = cat.nombre;
      }
      // 6B / 1.B — Campos de tipo_venta: solo se persisten cuando aplican,
      // para evitar dejar basura en BD en productos clásicos.
      const tipoVentaPayload = esProductoVariable(tipoVentaState)
        ? {
            tipo_venta: tipoVentaState.tipo_venta,
            ingrediente_base_id: tipoVentaState.ingrediente_base_id || '',
            ingrediente_base_nombre: tipoVentaState.ingrediente_base_nombre || '',
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

      const data = {
        nombre: nombre.trim(),
        precio_venta: precioNum,
        imagen_url: imagenUrl.trim() || undefined,
        descripcion: descripcion.trim() || undefined,
        activo,
        visible_en_pos: true,
        area_preparacion: 'ninguno',
        categoria_id: catId,
        // `categoria_nombre` NO se manda. Es un DERIVADO: el puente lo saca del
        // `join` con `categorias` al leer, así que no tiene columna donde caer y
        // mandarlo RECHAZA la petición entera —crear o editar un producto desde
        // esta pantalla fallaba siempre—. Renombrar la categoría cambia el
        // nombre en todos sus productos a la vez, que es lo que se quiere.
        ...tipoVentaPayload,
      };
      if (producto?.id) {
        await api.entidades.ProductoTerminado.update(producto.id, data);
      } else {
        await api.entidades.ProductoTerminado.create(data);
      }
      queryClient.invalidateQueries({ queryKey: ['productos_all'] });
      queryClient.invalidateQueries({ queryKey: ['productos_pos'] });
      queryClient.invalidateQueries({ queryKey: ['categorias_producto'] });
      toast.success(producto?.id ? 'Producto actualizado' : 'Producto creado');
      onClose();
    } catch (e) {
      toast.error('No se pudo guardar: ' + (e.message || ''));
    }
    setGuardando(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {producto?.id ? 'Editar producto' : 'Agregar producto'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Café Americano"
            />
          </div>
          <div>
            <Label className="text-xs">Categoría</Label>
            <CategoriaSelect
              value={categoriaId}
              onChange={(id, nombreCat) => {
                setCategoriaId(id);
                setCategoriaNombre(nombreCat || '');
              }}
              categorias={categorias}
              placeholder="General"
            />
          </div>
          <div>
            <Label className="text-xs">Precio</Label>
            <Input
              type="number"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label className="text-xs">Imagen del producto</Label>
            <div className="mt-1">
              <ImageUploader
                value={imagenUrl}
                onChange={setImagenUrl}
                height={140}
                label="Subir imagen del producto"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción (opcional)</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Breve descripción visible en el menú QR"
              rows={2}
            />
          </div>

          {/* 6B / 1.B — Tipo de venta. Default: Precio fijo. */}
          <TipoVentaSection
            value={tipoVentaState}
            onChange={(patch) => setTipoVentaState((prev) => ({ ...prev, ...patch }))}
            ingredientes={ingredientes}
          />

          <div className="flex items-center justify-between">
            <Label className="text-xs">Activo</Label>
            <Switch checked={activo} onCheckedChange={setActivo} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
